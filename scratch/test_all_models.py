import subprocess
import vertexai
from google.oauth2.credentials import Credentials
from vertexai.generative_models import GenerativeModel

def test_models():
    models_to_test = [
        "gemini-1.5-flash-001",
        "gemini-1.5-flash-002",
        "gemini-1.5-flash",
        "gemini-1.5-pro-001",
        "gemini-1.5-pro-002",
        "gemini-1.5-pro",
        "gemini-1.0-pro-001",
        "gemini-pro",
        "gemini-2.0-flash-exp",
        "gemini-2.0-flash-001",
        "gemini-2.0-flash"
    ]
    
    # Get active gcloud token
    token = subprocess.check_output("gcloud auth print-access-token", shell=True).decode().strip()
    creds = Credentials(token)
    
    # Get active gcloud project
    project = subprocess.check_output("gcloud config get-value project", shell=True).decode().strip()
    print("Using project:", project)
    
    vertexai.init(project=project, location="us-central1", credentials=creds)
    
    for model_name in models_to_test:
        try:
            model = GenerativeModel(model_name)
            response = model.generate_content("test")
            print(f"SUCCESS: {model_name} works!")
        except Exception as e:
            err_msg = str(e)
            if "404" in err_msg or "not found" in err_msg:
                print(f"FAILED: {model_name} (404 Not Found)")
            elif "403" in err_msg or "Permission" in err_msg:
                print(f"FAILED: {model_name} (403 Permission Denied: {err_msg})")
            else:
                print(f"FAILED: {model_name} ({err_msg})")

if __name__ == "__main__":
    test_models()
