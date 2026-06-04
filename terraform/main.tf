terraform {
  required_version = ">= 1.0.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
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
    "docs.googleapis.com"
  ])
  service            = each.key
  disable_on_destroy = false
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

resource "google_sql_user" "root_user" {
  name     = "root"
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
    spec {
      service_account_name = google_service_account.run_sa.email
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/translation-repo/translation-backend:latest"
        
        env {
          name  = "DB_HOST"
          value = google_sql_database_instance.mysql.public_ip_address
        }
        env {
          name  = "DB_USER"
          value = google_sql_user.root_user.name
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
    google_storage_bucket.config_files
  ]
}

# --- Cloud Run Frontend Service ---
resource "google_cloud_run_service" "frontend" {
  name     = "translation-frontend"
  location = var.region

  template {
    spec {
      service_account_name = google_service_account.run_sa.email
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/translation-repo/translation-frontend:latest"

        env {
          name  = "DB_HOST"
          value = google_sql_database_instance.mysql.public_ip_address
        }
        env {
          name  = "DB_USER"
          value = google_sql_user.root_user.name
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
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [google_cloud_run_service.backend]
}

# --- Make frontend public ---
resource "google_cloud_run_service_iam_member" "public_frontend" {
  location = google_cloud_run_service.frontend.location
  service  = google_cloud_run_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- Make backend accessible by frontend ---
resource "google_cloud_run_service_iam_member" "backend_invoker" {
  location = google_cloud_run_service.backend.location
  service  = google_cloud_run_service.backend.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.run_sa.email}"
}
