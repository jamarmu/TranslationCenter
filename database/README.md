# Database Layer - Translation Center

This directory contains the database schema script to initialize the MySQL tables required for storing translation jobs, tracking token usage, and recording application events/logs.

## Directory Files
- [schema.sql](file:///Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/database/schema.sql): Database tables creation script.

## Schema Architecture

### 1. `jobs`
Stores metadata and paths for document translation tasks.
- `id` (INT, Primary Key, Auto-increment)
- `job_name` (VARCHAR)
- `model_override` (VARCHAR, Nullable): Optional user-selected model override.
- `model_used` (VARCHAR): Active Gemini model name used for translation.
- `source_lang` (VARCHAR): Code/name of source language.
- `target_lang` (VARCHAR): Code/name of target language.
- `status` (VARCHAR): Queue and pipeline state: `PENDING`, `TRANSLATING`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `FAILED`.
- `source_file_path` (VARCHAR): Location URI of source document (`gs://...` or Google Drive URL).
- `candidate_file_path` (VARCHAR): Location URI of translation candidate draft.
- `output_file_path` (VARCHAR): Location URI of finalized/approved document.
- `file_type` (VARCHAR): File representation format (`pdf`, `gdoc`).
- `storage_type` (VARCHAR): Location resolver (`gcs`, `drive`).
- `created_at` (TIMESTAMP): Creation date.
- `updated_at` (TIMESTAMP): Modification timestamp.

### 2. `usage_logs`
Tracks Gemini API tokens consumed on a per-job basis for stats.
- `id` (INT, Primary Key)
- `job_id` (INT, Foreign Key referencing `jobs.id`)
- `tokens_consumed` (INT)
- `date` (DATE)

### 3. `app_logs`
Centralized application audit trail and runtime exception logger.
- `id` (INT, Primary Key)
- `severity` (VARCHAR): Severity of the entry (`INFO`, `ERROR`).
- `message` (TEXT): Log details or exception message.
- `timestamp` (TIMESTAMP): Occurrence date.

## Local Initialization
To import the database schemas locally, execute:
```bash
mysql -u root -p -e "source database/schema.sql"
```
Ensure your environment `.env` files in the frontend and backend are updated with the corresponding database connection details (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).
