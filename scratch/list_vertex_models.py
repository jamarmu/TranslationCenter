import subprocess
from google.cloud import aiplatform_v1
from google.oauth2.credentials import Credentials

def test():
    try:
        token = subprocess.check_output("gcloud auth print-access-token", shell=True).decode().strip()
        creds = Credentials(token, quota_project_id="californiahotel")
        
        client = aiplatform_v1.ModelGardenServiceClient(
            credentials=creds,
            client_options={"api_endpoint": "us-central1-aiplatform.googleapis.com"}
        )
        
        names = [
            "publishers/google/models/gemini-3.5-pro",
            "publishers/google/models/gemini-3.1-pro",
            "publishers/google/models/gemini-3.1-flash",
            "publishers/google/models/gemini-2.0-flash",
            "publishers/google/models/gemini-1.5-pro",
        ]
        
        for name in names:
            try:
                print(f"Getting publisher model: {name}")
                res = client.get_publisher_model(name=name)
                print(f"SUCCESS: {name} exists! version={res.version_id}")
            except Exception as e:
                print(f"FAILED {name}: {e}")
                
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test()
