import urllib.request
import json
import os
from dotenv import load_dotenv

# Load env variables from backend/.env
load_dotenv("backend/.env")

api_key = os.getenv("GROK_API_KEY")
if not api_key:
    print("Error: GROK_API_KEY not found in .env")
    exit(1)

url = "https://api.groq.com/openai/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}
data = {
    "model": "llama-3.3-70b-versatile",
    "messages": [{"role": "user", "content": "Just say the word 'Connected' if you can hear me."}],
    "max_tokens": 10
}

req = urllib.request.Request(url, headers=headers, data=json.dumps(data).encode("utf-8"))
try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode("utf-8"))
        print(f"✅ CONNECTION SUCCESSFUL: Groq responded with: '{result['choices'][0]['message']['content']}'")
except Exception as e:
    print("❌ CONNECTION FAILED Error:", e)
