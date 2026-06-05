-- Translation Center Database Schema

CREATE DATABASE IF NOT EXISTS translation_center;
USE translation_center;

-- Table for translation jobs
CREATE TABLE IF NOT EXISTS jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_name VARCHAR(255) NOT NULL,
    model_override VARCHAR(100) NULL,
    model_used VARCHAR(100) NOT NULL,
    source_lang VARCHAR(50) NOT NULL,
    target_lang VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL, -- PENDING, TRANSLATING, PENDING_REVIEW, APPROVED, REJECTED, FAILED
    source_file_path VARCHAR(1024) NOT NULL, -- GCS URI or Google Drive Link
    candidate_file_path VARCHAR(1024) NULL, -- GCS URI or Google Drive Link
    output_file_path VARCHAR(1024) NULL, -- GCS URI or Google Drive Link
    file_type VARCHAR(50) NOT NULL, -- pdf, gdoc
    storage_type VARCHAR(50) NOT NULL, -- gcs, drive
    verbose BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table for usage tracking
CREATE TABLE IF NOT EXISTS usage_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id INT NOT NULL,
    tokens_consumed INT NOT NULL,
    date DATE NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Table for application event and error logging
CREATE TABLE IF NOT EXISTS app_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    severity VARCHAR(50) NOT NULL, -- INFO, ERROR
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
