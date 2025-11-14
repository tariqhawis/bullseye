import asyncio
import json
import argparse
from urllib.parse import urljoin, urlparse
from concurrent.futures import ThreadPoolExecutor
import threading

from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

# --- Thread-safe storage ---
# A set of URLs that have already been visited or are in the queue to be visited.
visited_urls = set()
# A lock to ensure thread-safe access to the visited_urls set and the output file.
lock = threading.Lock()
# A set to store unique POST requests (URL + data) to avoid duplicates.
found_post_requests = set()

# The file where POST requests will be saved.
OUTPUT_FILE = "post_requests.txt"


def save_post_request(url, post_data_str, content_type):
    """Saves a unique POST request to the output file in a thread-safe manner."""
    global found_post_requests
    # Create a unique signature for the request to avoid duplicates
    request_signature = f"{url}|{post_data_str}"

    with lock:
        if request_signature not in found_post_requests:
            found_post_requests.add(request_signature)
            print(f"[+] Discovered POST request: {url}")

            # Save the request details as a JSON line
            request_info = {
                "url": url,
                "post_data": post_data_str,
                "content_type": content_type
            }
            with open(OUTPUT_FILE, "a") as f:
                f.write(json.dumps(request_info) + "\n")


async def crawl_page(browser_context, url, base_netloc):
    """

    Crawls a single page, intercepts POST requests, and finds new links.
    """
    if not url.startswith(('http://', 'https://')):
        return []

    try:
        page = await browser_context.new_page()

        # Define the request handler to intercept POST requests
        def request_handler(request):
            if request.method == "POST":
                content_type = request.headers.get('content-type', '')
                save_post_request(request.url, request.post_data or "", content_type)

        page.on("request", request_handler)

        # Navigate to the page
        await page.goto(url, wait_until="domcontentloaded", timeout=15000)

        # Get page content and find new links
        content = await page.content()
        soup = BeautifulSoup(content, 'html.parser')

        new_links = []
        for link in soup.find_all('a', href=True):
            href = link['href']
            full_url = urljoin(url, href)
            parsed_url = urlparse(full_url)

            # Add link if it's in scope, not an anchor, and not visited
            if parsed_url.netloc == base_netloc and "#" not in full_url:
                with lock:
                    if full_url not in visited_urls:
                        visited_urls.add(full_url)
                        new_links.append(full_url)

    except Exception as e:
        print(f"[!] Error crawling {url}: {e}")
        return []
    finally:
        if 'page' in locals():
            await page.close()

    return new_links


async def main():
    """Main function to set up and run the crawler."""
    parser = argparse.ArgumentParser(description="Multi-threaded web crawler to discover POST requests.")
    parser.add_argument("url", help="The starting URL to crawl.")
    parser.add_argument(
        "--cookies",
        help='''Custom cookies as a JSON string. 
        Example: '[{"name": "session", "value": "xyz", "domain": ".example.com", "path": "/"}]' '''
    )
    parser.add_argument(
        "--threads",
        type=int,
        default=4,
        help="Number of concurrent threads to use for crawling."
    )
    args = parser.parse_args()

    start_url = args.url
    base_netloc = urlparse(start_url).netloc

    # Clear output file at the start
    with open(OUTPUT_FILE, "w") as f:
        pass

    print(f"--- Starting Crawler on {start_url} ---")

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=False)

        # Parse and set up custom cookies
        cookies = json.loads(args.cookies) if args.cookies else []
        browser_context = await browser.new_context()
        if cookies:
            await browser_context.add_cookies(cookies)
            print(f"[INFO] Loaded {len(cookies)} custom cookies.")

        # Initialize the queue with the starting URL
        urls_to_crawl = [start_url]
        visited_urls.add(start_url)
        print("here")

        with ThreadPoolExecutor(max_workers=args.threads) as executor:

            while urls_to_crawl:
                # Process a batch of URLs concurrently
                batch = urls_to_crawl[:args.threads]
                urls_to_crawl = urls_to_crawl[args.threads:]
                print("Added URL")

                futures = [executor.submit(asyncio.run, crawl_page(browser_context, url, base_netloc)) for url in batch]
        #         print ("Added futures")

                for future in futures:
                    print("getting result")
                    new_links = future.result()

                    urls_to_crawl.extend(new_links)

        await browser.close()

    print("--- Crawler finished ---")
    print(f"Discovered POST requests saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
