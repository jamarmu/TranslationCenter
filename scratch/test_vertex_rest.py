import subprocess
import json
import urllib.request
import urllib.error
import ssl

def test_apis():
    token = subprocess.check_output("gcloud auth print-access-token", shell=True).decode().strip()
    ctx = ssl._create_unverified_context()
    
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": "Hello, reply with one word: SUCCESS."}
                ]
            }
        ]
    }
    
    models = ["gemini-3.5-flash", "gemini-3.5-flash-001", "gemini-3.5-pro"]
    
    for m in models:
        vertex_url = f"https://us-central1-aiplatform.googleapis.com/v1/projects/californiahotel/locations/us-central1/publishers/google/models/{m}:generateContent"
        print(f"Testing Vertex AI {m}...")
        req = urllib.request.Request(
            vertex_url,
            data=json.dumps(body).encode("utf-8"),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, context=ctx) as response:
                print(f"SUCCESS {m}:", response.read().decode("utf-8")[:300])
        except Exception as e:
            print(f"FAILED {m}:", e)
            if hasattr(e, 'read'):
                print(e.read().decode("utf-8")[:300])

if __name__ == "__main__":
    test_apis()
