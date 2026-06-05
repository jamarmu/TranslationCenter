output "frontend_url" {
  description = "The public URL of the Translation Center frontend service"
  value       = google_cloud_run_service.frontend.status[0].url
}

output "backend_url" {
  description = "The endpoint of the Translation Center backend translator"
  value       = google_cloud_run_service.backend.status[0].url
}

output "mysql_ip_address" {
  description = "Public IP address of the MySQL instance"
  value       = google_sql_database_instance.mysql.public_ip_address
}

output "input_files_bucket" {
  description = "Name of GCS Bucket for input documents"
  value       = google_storage_bucket.input_files.name
}

output "output_files_bucket" {
  description = "Name of GCS Bucket for output/candidate documents"
  value       = google_storage_bucket.output_files.name
}

output "config_bucket" {
  description = "Name of GCS Bucket for translation configurations"
  value       = google_storage_bucket.config_files.name
}
