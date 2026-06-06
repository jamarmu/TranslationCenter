terraform {
  required_version = ">= 1.0.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# --- GCP Service APIs Activation ---
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "aiplatform.googleapis.com",
    "drive.googleapis.com",
    "docs.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com"
  ])
  service            = each.key
  disable_on_destroy = false
}

# --- Artifact Registry Docker Repository ---
resource "google_artifact_registry_repository" "translation_repo" {
  location      = var.region
  repository_id = "translation-repo"
  description   = "Docker repository for Translation Center microservices"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

# --- Build and Push Docker Images using Cloud Build ---
resource "null_resource" "build_backend" {
  triggers = {
    main_py          = filesha1("${path.module}/../backend/main.py")
    translator_py    = filesha1("${path.module}/../backend/translator.py")
    db_py            = filesha1("${path.module}/../backend/db.py")
    dockerfile       = filesha1("${path.module}/../backend/Dockerfile")
    requirements_txt = filesha1("${path.module}/../backend/requirements.txt")
  }

  provisioner "local-exec" {
    command = "gcloud builds submit --tag ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.translation_repo.repository_id}/translation-backend:latest ${path.module}/../backend --project ${var.project_id}"
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.translation_repo,
    google_storage_bucket.config_files,
    google_project_iam_member.compute_storage_viewer,
    google_project_iam_member.compute_artifact_writer
  ]
}

resource "null_resource" "build_frontend" {
  triggers = {
    package_json      = filesha1("${path.module}/../frontend/package.json")
    package_lock_json = filesha1("${path.module}/../frontend/package-lock.json")
    server_js         = filesha1("${path.module}/../frontend/server.js")
    users_json        = filesha1("${path.module}/../frontend/users.json")
    dockerfile        = filesha1("${path.module}/../frontend/Dockerfile")
    vite_config       = filesha1("${path.module}/../frontend/vite.config.js")
    index_html        = filesha1("${path.module}/../frontend/index.html")
    app_jsx           = filesha1("${path.module}/../frontend/src/App.jsx")
    index_css         = filesha1("${path.module}/../frontend/src/index.css")
    main_jsx          = filesha1("${path.module}/../frontend/src/main.jsx")
  }

  provisioner "local-exec" {
    command = "gcloud builds submit --tag ${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.translation_repo.repository_id}/translation-frontend:latest ${path.module}/../frontend --project ${var.project_id}"
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.translation_repo,
    google_storage_bucket.config_files,
    google_project_iam_member.compute_storage_viewer,
    google_project_iam_member.compute_artifact_writer
  ]
}

# --- Google Cloud Storage Buckets ---
resource "google_storage_bucket" "input_files" {
  name          = "${var.project_id}_translation_input_files"
  location      = var.region
  force_destroy = true

  uniform_bucket_level_access = true
  depends_on                  = [google_project_service.apis]
}

resource "google_storage_bucket" "output_files" {
  name          = "${var.project_id}_translation_output_files"
  location      = var.region
  force_destroy = true

  uniform_bucket_level_access = true
  depends_on                  = [google_project_service.apis]
}

resource "google_storage_bucket" "config_files" {
  name          = "${var.project_id}_translation_config"
  location      = var.region
  force_destroy = true

  uniform_bucket_level_access = true
  depends_on                  = [google_project_service.apis]
}

# --- Google Cloud Storage Bucket Objects (Configurations) ---
resource "google_storage_bucket_object" "translation_prompt" {
  name   = "translation_prompt.md"
  bucket = google_storage_bucket.config_files.name
  source = "${path.module}/../config_init/translation_prompt.md"
}

resource "google_storage_bucket_object" "translation_corpus" {
  name   = "translation_corpus.csv"
  bucket = google_storage_bucket.config_files.name
  source = "${path.module}/../config_init/translation_corpus.csv"
}

resource "google_storage_bucket_object" "do_not_translate" {
  name   = "do_not_translate.csv"
  bucket = google_storage_bucket.config_files.name
  source = "${path.module}/../config_init/do_not_translate.csv"
}

resource "google_storage_bucket_object" "translation_config" {
  name   = "translation_config.md"
  bucket = google_storage_bucket.config_files.name
  source = "${path.module}/../config_init/translation_config.md"
}

# --- Managed Cloud SQL MySQL Database ---
resource "google_sql_database_instance" "mysql" {
  name             = "${var.project_id}-mysql-instance"
  database_version = "MYSQL_8_0"
  region           = var.region

  settings {
    tier = "db-f1-micro" # Lightweight development tier
    ip_configuration {
      ipv4_enabled = true # Allowed direct connection (restrict IP ranges in production)
    }
  }
  deletion_protection = false
  depends_on          = [google_project_service.apis]
}

resource "google_sql_database" "database" {
  name     = "translation_center"
  instance = google_sql_database_instance.mysql.name
}

resource "google_sql_user" "app_user" {
  name     = "translation_app_user"
  instance = google_sql_database_instance.mysql.name
  password = var.db_password
}

# --- IAM Service Account for Cloud Run Services ---
resource "google_service_account" "run_sa" {
  account_id   = "translation-center-sa"
  display_name = "Service Account for Translation Center Cloud Run services"
}

# GCS Storage Admin access for SA
resource "google_storage_bucket_iam_member" "input_admin" {
  bucket = google_storage_bucket.input_files.name
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.run_sa.email}"
}

resource "google_storage_bucket_iam_member" "output_admin" {
  bucket = google_storage_bucket.output_files.name
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.run_sa.email}"
}

resource "google_storage_bucket_iam_member" "config_admin" {
  bucket = google_storage_bucket.config_files.name
  role   = "roles/storage.admin"
  member = "serviceAccount:${google_service_account.run_sa.email}"
}

# SQL Client role for SA
resource "google_project_iam_member" "sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.run_sa.email}"
}

# Vertex AI User role for SA to call Gemini
resource "google_project_iam_member" "vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.run_sa.email}"
}

# --- Cloud Run Translation Backend Service ---
resource "google_cloud_run_service" "backend" {
  name     = "translation-backend"
  location = var.region

  template {
    metadata {
      annotations = {
        "run.googleapis.com/cloudsql-instances" = google_sql_database_instance.mysql.connection_name
      }
    }
    spec {
      service_account_name = google_service_account.run_sa.email
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.translation_repo.repository_id}/translation-backend:latest"
        
        env {
          name  = "DB_HOST"
          value = google_sql_database_instance.mysql.public_ip_address
        }
        env {
          name  = "DB_USER"
          value = google_sql_user.app_user.name
        }
        env {
          name  = "DB_PASSWORD"
          value = var.db_password
        }
        env {
          name  = "DB_NAME"
          value = google_sql_database.database.name
        }
        env {
          name  = "GCP_PROJECT"
          value = var.project_id
        }
        env {
          name  = "GCP_REGION"
          value = var.region
        }
        env {
          name  = "DB_SOCKET_PATH"
          value = "/cloudsql/${google_sql_database_instance.mysql.connection_name}"
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [
    google_sql_database_instance.mysql,
    google_storage_bucket.input_files,
    google_storage_bucket.output_files,
    google_storage_bucket.config_files,
    null_resource.build_backend
  ]
}

# --- Cloud Run Frontend Service ---
resource "google_cloud_run_service" "frontend" {
  name     = "translation-frontend"
  location = var.region

  template {
    metadata {
      annotations = {
        "run.googleapis.com/cloudsql-instances" = google_sql_database_instance.mysql.connection_name
      }
    }
    spec {
      service_account_name = google_service_account.run_sa.email
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.translation_repo.repository_id}/translation-frontend:latest"

        env {
          name  = "DB_HOST"
          value = google_sql_database_instance.mysql.public_ip_address
        }
        env {
          name  = "DB_USER"
          value = google_sql_user.app_user.name
        }
        env {
          name  = "DB_PASSWORD"
          value = var.db_password
        }
        env {
          name  = "DB_NAME"
          value = google_sql_database.database.name
        }
        env {
          name  = "GCP_PROJECT"
          value = var.project_id
        }
        env {
          name  = "JWT_SECRET"
          value = var.jwt_secret
        }
        env {
          name  = "TRANSLATION_BACKEND_URL"
          value = "${google_cloud_run_service.backend.status[0].url}/translate"
        }
        env {
          name  = "DB_SOCKET_PATH"
          value = "/cloudsql/${google_sql_database_instance.mysql.connection_name}"
        }
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [
    google_cloud_run_service.backend,
    null_resource.build_frontend
  ]
}

# --- Make frontend accessible to authorized domain ---
resource "google_cloud_run_service_iam_member" "public_frontend" {
  location = google_cloud_run_service.frontend.location
  service  = google_cloud_run_service.frontend.name
  role     = "roles/run.invoker"
  member   = var.authorized_domain != "" ? "domain:${var.authorized_domain}" : "allUsers"
}

# --- Make backend accessible by frontend ---
resource "google_cloud_run_service_iam_member" "backend_invoker" {
  location = google_cloud_run_service.backend.location
  service  = google_cloud_run_service.backend.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.run_sa.email}"
}

# --- Data source to retrieve project number ---
data "google_project" "project" {}

# --- Grant Compute Service Account storage reader permission for Cloud Build ---
resource "google_project_iam_member" "compute_storage_viewer" {
  project    = var.project_id
  role       = "roles/storage.objectViewer"
  member     = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
  depends_on = [google_project_service.apis]
}

# --- Grant Compute Service Account Artifact Registry writer permission for Cloud Build ---
resource "google_project_iam_member" "compute_artifact_writer" {
  project    = var.project_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com"
  depends_on = [google_project_service.apis]
}
