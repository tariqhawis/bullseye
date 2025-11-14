import asyncio
import os
from playwright.async_api import async_playwright
from urllib.parse import urlparse

async def capture_har_for_url(url: str):
    """
    Launches Chrome, navigates to a URL, and captures a full HAR file.
    The HAR file includes all request/response data and is named after the domain.
    """
    try:
        # Generate a temporary and a final filename from the URL
        parsed_url = urlparse(url)
        # Sanitize the domain to create a valid filename
        domain_name = parsed_url.netloc.replace('.', '_')
        temp_har_path = "temp_capture.har"
        final_har_path = f"{domain_name}.har"

        print(f"Starting HAR capture for: {url}")
        print(f"Temporary HAR will be saved to: {temp_har_path}")
        print(f"Final HAR will be named: {final_har_path}")

        async with async_playwright() as p:
            # Launch the browser using the installed 'chrome' channel
            browser = await p.chromium.launch(
                channel="chrome",  # Use 'msedge', 'chrome', or 'chromium'
                headless=False     # Set to True to run without a visible browser window
            )

            # Create a new context with HAR recording enabled
            context = await browser.new_context(
                record_har_path=temp_har_path,
                record_har_content="embed"  # Use 'full' to capture all content
            )

            # Create a new page in the context
            page = await context.new_page()

            try:
                # Navigate to the target URL
                print(f"Navigating to {url}...")
                await page.goto(url, wait_until="networkidle", timeout=60000)
                print("Page loaded. Performing a short wait for any extra network traffic...")
                
                # Optional: Add a small delay to catch any post-load async requests
                await asyncio.sleep(5)

            except Exception as e:
                print(f"An error occurred during navigation: {e}")
            finally:
                # IMPORTANT: Closing the context is what flushes and saves the HAR file
                print("Closing context and saving HAR file...")
                await context.close()
                await browser.close()
                print("Browser closed.")

        # Rename the file to its final name
        if os.path.exists(temp_har_path):
            if os.path.exists(final_har_path):
                print(f"Warning: Overwriting existing file '{final_har_path}'")
                os.remove(final_har_path)
            os.rename(temp_har_path, final_har_path)
            print(f"Successfully captured and saved HAR to: {final_har_path}")
        else:
            print("Error: Temporary HAR file was not created.")

    except Exception as e:
        print(f"A critical error occurred: {e}")

# --- Main Execution ---
if __name__ == "__main__":
    # Replace this with the URL you want to capture
    target_url = "https://www.reddit.com" 
    
    asyncio.run(capture_har_for_url(target_url))