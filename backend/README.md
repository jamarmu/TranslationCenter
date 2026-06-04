# Translation Backend - Translation Center

The translation service is a Python application built with **FastAPI** that runs the background translation pipeline jobs. It extracts layout text from documents, interacts with the **Gemini model API**, applies a translation corpus and do-not-translate rules, and rebuilds the documents maintaining their original formats.

## Directory Structure
- [main.py](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/backend/main.py): FastAPI app router. Receives `/translate` webhooks and spawns worker tasks.
- [translator.py](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/backend/translator.py): Core translation workflow executor.
- [db.py](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/backend/db.py): MySQL client helpers.
- [requirements.txt](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/backend/requirements.txt): Python libraries.
- [Dockerfile](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/backend/Dockerfile): Container blueprint.

## Document Translation Overlay Logic

### 1. PDF File Overlay Translation
- The service uses **PyMuPDF** (`fitz`) to extract block-level text items along with their bounding box coordinates (`bbox`), fonts, and sizing.
- The raw texts are wrapped in custom XML-like identifiers `<block id="...">...</block>`.
- The formatted prompt is sent to Gemini (e.g. `gemini-1.5-flash` or `gemini-1.5-pro` based on configurations). The model is instructed to translate the contents but strictly preserve the block layout tag format.
- A clean copy of the original PDF is opened. The script overlays white rectangles on the original coordinate boxes (redacting the original language), then draws the translated text inside the exact same dimensions, preserving the document layout.

### 2. Google Docs & Drive Copying
- For files linked via Google Drive, the service uses the **Google Drive & Docs APIs** to copy the document, parse its paragraphs, query the Gemini translation, and perform backward batch index updates to replace original text runs with translated runs while maintaining font sizes, colors, and embedded images.

## Environment Variables
Ensure the following variables are configured in the environment where the backend is running:
```env
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=password
DB_NAME=translation_center
DB_PORT=3306
GCP_PROJECT=translation-center-project
GCP_REGION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json # Required for local development to authenticate Vertex AI calls
```

## Running Locally

### 1. Virtual Environment Setup
Ensure python (>= 3.9) is installed:
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Start FastAPI Server
```bash
python main.py
```
The microservice will start on `http://localhost:5000`. You can test it by calling `GET http://localhost:5000/health`.
