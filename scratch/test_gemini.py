import vertexai
from vertexai.generative_models import GenerativeModel

def test():
    try:
        vertexai.init(project="californiahotel", location="us-central1")
        model = GenerativeModel("gemini-1.5-flash-001")
        response = model.generate_content("Hello, this is a test. Reply with one word: Success.")
        print("Response:", response.text)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test()
