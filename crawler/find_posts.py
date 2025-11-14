import json
import argparse
import base64

def filter_post_requests(har_file_path: str):
    """
    Reads a HAR file and prints details for all POST requests found.

    Args:
        har_file_path (str): The full path to the .har file.
    """
    try:
        with open(har_file_path, 'r', encoding='utf-8') as f:
            har_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: The file '{har_file_path}' was not found.")
        return
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from '{har_file_path}'. The file might be corrupted.")
        return
    except Exception as e:
        print(f"An unexpected error occurred while reading the file: {e}")
        return

    # The actual network requests are in the 'entries' list
    try:
        entries = har_data['log']['entries']
    except KeyError:
        print("Error: The HAR file seems to have an invalid structure. Missing 'log' or 'entries' key.")
        return
    
    post_requests = []
    for entry in entries:
        # Check if the request method is POST (case-insensitive)
        if entry['request']['method'].upper() == 'POST':
            post_requests.append(entry)

    if not post_requests:
        print("No POST requests found in this HAR file.")
        return

    print(f"Found {len(post_requests)} POST request(s). Details below:\n")

    # Iterate through the filtered POST requests and print details
    for i, entry in enumerate(post_requests, 1):
        request = entry['request']
        response = entry['response']

        print(f"--- [ POST Request #{i} ] ------------------------------------")
        print(f"URL: {request['url']}")
        print(f"Response Status: {response['status']} {response['statusText']}")
        
        # --- Print Request Payload ---
        print("\n[Request Payload]")
        if 'postData' in request and 'text' in request['postData']:
            # The payload might be JSON itself, try to pretty-print it
            try:
                payload_json = json.loads(request['postData']['text'])
                print(json.dumps(payload_json, indent=2))
            except json.JSONDecodeError:
                # If it's not JSON, print as plain text
                print(request['postData']['text'])
        else:
            print("[No request payload found or payload is not text]")

        # --- Print Response Body ---
        print("\n[Response Body]")
        if 'content' in response and 'text' in response['content']:
            content = response['content']
            response_text = content['text']
            
            # HAR content can be base64 encoded, so we need to decode it
            if content.get('encoding') == 'base64':
                try:
                    decoded_bytes = base64.b64decode(response_text)
                    response_text = decoded_bytes.decode('utf-8', errors='replace')
                except Exception as e:
                    response_text = f"[Could not decode base64 content: {e}]"

            # The response body might also be JSON, try to pretty-print it
            try:
                response_json = json.loads(response_text)
                print(json.dumps(response_json, indent=2))
            except (json.JSONDecodeError, TypeError):
                # If it's not JSON or already decoded, print as plain text
                print(response_text)
        else:
            print("[No response body content captured]")
        
        print("----------------------------------------------------------\n")

if __name__ == "__main__":
    # Set up command-line argument parsing
    parser = argparse.ArgumentParser(
        description="A script to read a HAR file and filter for POST requests.",
        epilog="Example: python read_har_post.py my_website.har"
    )
    parser.add_argument(
        "har_file", 
        help="Path to the HAR file you want to analyze."
    )
    
    args = parser.parse_args()
    filter_post_requests(args.har_file)