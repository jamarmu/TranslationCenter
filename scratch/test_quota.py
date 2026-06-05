import subprocess
import vertexai
from google.oauth2.credentials import Credentials
from vertexai.generative_models import GenerativeModel

def test():
    try:
        token = subprocess.check_output("gcloud auth print-access-token", shell=True).decode().strip()
        # Pass quota_project_id to Credentials
        creds = Credentials(token, quota_project_id="californiahotel")
        
        vertexai.init(project="californiahotel", location="us-central1", credentials=creds)
        
        models = ["gemini-3.5-flash", "gemini-3.5-pro", "gemini-1.5-flash-001"]
        for m in models:
            try:
                print(f"Testing model {m}...")
                model = GenerativeModel(m)
                response = model.generate_content("Reply with SUCCESS")
                print(f"SUCCESS {m}: {response.text.strip()}")
            except Exception as e:
                print(f"FAILED {m}: {e}")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test()
