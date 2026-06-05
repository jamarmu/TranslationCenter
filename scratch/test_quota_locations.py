import subprocess
import vertexai
from google.oauth2.credentials import Credentials
from vertexai.generative_models import GenerativeModel

def test():
    token = subprocess.check_output("gcloud auth print-access-token", shell=True).decode().strip()
    creds = Credentials(token, quota_project_id="californiahotel")
    
    # Initialize vertexai in us-central1
    vertexai.init(project="californiahotel", location="us-central1", credentials=creds)
    
    try:
        model = GenerativeModel("gemini-1.5-pro")
        response = model.generate_content("Reply with SUCCESS")
        print(f"SUCCESS gemini-1.5-pro in us-central1: {response.text.strip()}")
    except Exception as e:
        print(f"FAILED gemini-1.5-pro in us-central1: {e}")

if __name__ == "__main__":
    test()
