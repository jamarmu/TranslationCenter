variable "project_id" {
  description = "The GCP Project ID where resources will be deployed"
  type        = string
}

variable "region" {
  description = "The GCP region to deploy resources"
  type        = string
  default     = "us-central1"
}

variable "db_password" {
  description = "The root password for the Cloud SQL MySQL instance"
  type        = string
  sensitive   = true
}

variable "gemini_api_key" {
  description = "Gemini Model API Key for translation services"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "Secret key for JWT verification in frontend service"
  type        = string
  default     = "translation-center-secret-prod"
  sensitive   = true
}
