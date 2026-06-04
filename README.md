# Translation Center - Enterprise Document Translator

Translation Center is a microservices-based translation management system. It enables teams to upload documents (PDFs and Google Docs) from local machines or import them directly via Google Drive links. The system translates the document content using the **Gemini model API** while leveraging a translation knowledge base corpus and do-not-translate rules. It preserves document layouts, formatting, and embedded images. 

After translation, the document goes through an approval workflow where reviewers can approve or reject the candidates.

## System Architecture

![Translation Center - Software Architecture](./architecture.png)

### Key Architectural Flow
1. **Frontend Service (React + Express)** handles authentication (using a local file `users.json` storing roles and hashed passwords) and hosts the main application UI and Admin dashboard.
2. **Database Layer (Cloud SQL MySQL)** stores job data, logs, and token usage metrics.
3. **Storage Layer (Google Cloud Storage)** uses three buckets: `translation_input_files` for source files, `translation_output_files` for translation candidate and final output documents, and `translation_config` for configs (`translation_config.md`), prompts (`translation_prompt.md`), corpus, and DNT terms list.
4. **Translation Backend Service (Python FastAPI)** listens for triggers, fetches the document, extracts block layout items, calls Gemini model API to translate layout content, and overlays translated texts back onto the original layout coordinates to preserve formatting.

## Deploy instructions

Use files under the terraform folder to create the relevant services in a GCP project:

cd terraform
terraform init
terraform apply -var="project_id=CHANGE_ME" -var="db_password=YOUR_MYSQL_PASSWORD"


---

## Directory Mappings

- [database/](file:///TranslationCenter/database/README.md): MySQL schema scripts.
  - [database/schema.sql](file:///TranslationCenter/database/schema.sql)
- [frontend/](file:///TranslationCenter/frontend/README.md): Vite React + Express server API code.
  - [frontend/server.js](file:///TranslationCenter/frontend/server.js)
  - [frontend/users.json](file:///TranslationCenter/frontend/users.json)
  - [frontend/src/App.jsx](file:///TranslationCenter/frontend/src/App.jsx)
  - [frontend/src/index.css](file:///TranslationCenter/frontend/src/index.css)
- [backend/](file:///TranslationCenter/backend/README.md): Python FastAPI translator microservice.
  - [backend/main.py](file:///TranslationCenter/backend/main.py)
  - [backend/translator.py](file:///TranslationCenter/backend/translator.py)
- [terraform/](file:///TranslationCenter/terraform/README.md): Infrastructure deployment scripts.
  - [terraform/main.tf](file:///TranslationCenter/terraform/main.tf)
- [config_init/](file:///TranslationCenter/config_init/): Initialization files for translation config.
  - [config_init/translation_corpus.csv](file:///TranslationCenter/config_init/translation_corpus.csv)
  - [config_init/do_not_translate.csv](file:///TranslationCenter/config_init/do_not_translate.csv)

---

## Local Development Guide

To run the full stack locally for development:

### Prerequisite 1: Initialize Database
Set up a local MySQL instance and run:
```bash
mysql -u root -p -e "source database/schema.sql"
```

### Prerequisite 2: Environment Variables
Create `.env` configuration files inside `frontend/` and `backend/` directories mapping your database credentials, Google Cloud service credentials, and Gemini API keys. (See the respective README files for details).

### Start Frontend Gateway
```bash
cd frontend
npm install
npm run build # Build React SPA bundle
npm start     # Runs Express server at http://localhost:8080
```

### Start Translation Backend
In another terminal:
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py # Runs FastAPI server at http://localhost:5000
```
Now, navigate your browser to `http://localhost:8080` to access Translation Center!
