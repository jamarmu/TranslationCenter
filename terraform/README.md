# Infrastructure as Code (IaC) - Translation Center

This directory contains **Terraform** configuration files to orchestrate the deployment of the Translation Center application services to Google Cloud Platform (GCP).

## Directory Files
- [main.tf](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/terraform/main.tf): Resource declarations including GCS Buckets, Cloud SQL Instance, IAM service accounts, and Cloud Run services.
- [variables.tf](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/terraform/variables.tf): Configuration parameters.
- [outputs.tf](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/terraform/outputs.tf): Resource properties exported after execution.

## Provisions List

### 1. Services & APIs
Enables required GCP APIs: Cloud Run, Cloud SQL Admin, Cloud Storage, Vertex AI (Gemini), Google Drive, and Google Docs.

### 2. GCS Storage Buckets
Creates three GCS buckets:
- `<project_id>_translation_input_files`: Source files.
- `<project_id>_translation_output_files`: Translation candidate and approved outputs.
- `<project_id>_translation_config`: Application runtime translation files and prompt configurations.

### 3. Cloud SQL Instance
Provisions a managed MySQL database instance running version 8.0 on a lightweight `db-f1-micro` machine tier.

### 4. Cloud Run Services
- **Translation Backend (`translation-backend`)**: Deploys the Python FastAPI microservice.
- **Frontend Gateway (`translation-frontend`)**: Deploys the Express + React web app and maps it publicly with IAM invoker rights.

## Deployment Steps

1. Install Terraform.
2. Build and push the docker images for the frontend and backend to Google Container Registry (GCR) in your project:
   ```bash
   # Build & push backend
   docker build -t gcr.io/[PROJECT_ID]/translation-backend:latest ./backend
   docker push gcr.io/[PROJECT_ID]/translation-backend:latest
   
   # Build & push frontend
   docker build -t gcr.io/[PROJECT_ID]/translation-frontend:latest ./frontend
   docker push gcr.io/[PROJECT_ID]/translation-frontend:latest
   ```
3. Initialize the directory and review variables:
   ```bash
   terraform init
   ```
4. Perform execution check:
   ```bash
   terraform plan -var="project_id=[PROJECT_ID]" -var="db_password=[MYSQL_ROOT_PASS]" -var="gemini_api_key=[API_KEY]"
   ```
5. Apply and provision:
   ```bash
   terraform apply -var="project_id=[PROJECT_ID]" -var="db_password=[MYSQL_ROOT_PASS]" -var="gemini_api_key=[API_KEY]"
   ```
