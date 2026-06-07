import os
import re
import csv
import json
import tempfile
import sys
from datetime import datetime
import fitz  # PyMuPDF
import vertexai
from vertexai.generative_models import GenerativeModel
from google.cloud import storage
from googleapiclient.discovery import build
from google.oauth2 import service_account
from db import log_event, log_tokens, update_job_status, get_job

# Load environment variables
GCP_PROJECT = os.getenv("GCP_PROJECT")
if not GCP_PROJECT:
    raise RuntimeError("GCP_PROJECT environment variable is required but not set.")
GCP_REGION = os.getenv("GCP_REGION", "us-central1")
VERTEX_AI_LOCATION = "global"
CONFIG_BUCKET = f"{GCP_PROJECT}_translation_config"
OUTPUT_BUCKET = f"{GCP_PROJECT}_translation_output_files"
INPUT_BUCKET = f"{GCP_PROJECT}_translation_input_files"

# Initialize Vertex AI SDK
try:
    vertexai.init(project=GCP_PROJECT, location=GCP_REGION)
    log_event("INFO", f"Vertex AI initialized successfully in project {GCP_PROJECT} ({GCP_REGION})")
except Exception as e:
    log_event("ERROR", f"Failed to initialize Vertex AI: {e}")

# Helper to get Google Drive/Docs API service client
def get_google_services():
    try:
        # Standard GCP Application Default Credentials or service account credentials
        creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if creds_path and os.path.exists(creds_path):
            creds = service_account.Credentials.from_service_account_file(
                creds_path,
                scopes=[
                    'https://www.googleapis.com/auth/drive',
                    'https://www.googleapis.com/auth/documents'
                ]
            )
        else:
            # Fallback to default
            import google.auth
            creds, _ = google.auth.default(scopes=[
                'https://www.googleapis.com/auth/drive',
                'https://www.googleapis.com/auth/documents'
            ])
        
        drive_service = build('drive', 'v3', credentials=creds)
        docs_service = build('docs', 'v1', credentials=creds)
        return drive_service, docs_service
    except Exception as e:
        log_event("ERROR", f"Google Drive API connection failed: {e}")
        return None, None

# Parse config.md to extract translation settings
def parse_translation_config():
    client = storage.Client()
    bucket = client.bucket(CONFIG_BUCKET)
    blob = bucket.blob("translation_config.md")
    
    settings = {
        "model": "Gemini 3.5 Flash",
        "languages": "Spanish, English, French, German",
        "corpus_file": "translation_corpus.csv",
        "dnt_file": "do_not_translate.csv"
    }
    
    try:
        content = blob.download_as_text()
        model_match = re.search(r"-\s+\*\*Model\*\*:\s*(.*)", content, re.IGNORECASE)
        if model_match:
            raw_model = model_match.group(1).strip()
            if "," in raw_model:
                settings["model"] = raw_model.split(",")[0].strip()
            else:
                settings["model"] = raw_model
            
        langs_match = re.search(r"-\s+\*\*Supported Languages\*\*:\s*(.*)", content, re.IGNORECASE)
        if langs_match:
            settings["languages"] = langs_match.group(1).strip()
            
        corpus_match = re.search(r"-\s+\*\*Translation Knowledge Base CSV\*\*:\s*(.*)", content, re.IGNORECASE)
        if corpus_match:
            settings["corpus_file"] = corpus_match.group(1).strip()
            
        dnt_match = re.search(r"-\s+\*\*Do Not Translate CSV\*\*:\s*(.*)", content, re.IGNORECASE)
        if dnt_match:
            settings["dnt_file"] = dnt_match.group(1).strip()
            
    except Exception as e:
        log_event("ERROR", f"Failed to download config from GCS: {e}. Using default settings.")
        
    return settings

# Retrieve CSV file from GCS and return content as text
def get_gcs_file_text(filename):
    if not filename:
        return ""
    try:
        client = storage.Client()
        bucket = client.bucket(CONFIG_BUCKET)
        blob = bucket.blob(filename)
        if blob.exists():
            return blob.download_as_text()
    except Exception as e:
        log_event("ERROR", f"Failed to fetch file {filename} from config bucket: {e}")
    return ""

# Run Gemini Translation Model call
def run_gemini_translation(prompt_text, model_name="gemini-3.5-flash", verbose=False):
    api_model = model_name.strip() if (model_name and model_name.strip()) else "gemini-3.5-flash"
    location = VERTEX_AI_LOCATION
        
    try:
        # Re-initialize vertexai context with the correct location for the model
        vertexai.init(project=GCP_PROJECT, location=location)
        model = GenerativeModel(api_model)
        if verbose:
            log_event("INFO", f"Gemini Prompt:\n{prompt_text}")
            print(f"Gemini Prompt:\n{prompt_text}", flush=True)
        log_event("INFO", f"Sending translation request via Vertex AI ({location}) to model {api_model}")
        response = model.generate_content(prompt_text)
        if verbose:
            log_event("INFO", f"Gemini Response:\n{response.text}")
            print(f"Gemini Response:\n{response.text}", flush=True)
        
        # Token usage calculations
        input_tokens = len(prompt_text) // 4  # Rough estimation
        output_tokens = len(response.text) // 4
        total_tokens = input_tokens + output_tokens
        
        return response.text, total_tokens
    except Exception as e:
        log_event("ERROR", f"Vertex AI Gemini API invocation failed for model {api_model} in {location}: {e}")
        raise e

# Core PDF Text Extraction & Redaction Translation Overlay

def extract_pdf_to_temps(input_path):
    doc = fitz.open(input_path)
    xml_blocks = []
    block_map = {}
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        page_dict = page.get_text("dict")
        for b_idx, block in enumerate(page_dict.get("blocks", [])):
            if "lines" not in block:
                continue
            
            block_text = ""
            for line in block["lines"]:
                for span in line["spans"]:
                    block_text += span["text"] + " "
            
            block_text = block_text.strip()
            if not block_text:
                continue
                
            block_id = f"p{page_num}_b{b_idx}"
            xml_blocks.append(f'<block id="{block_id}">{block_text}</block>')
            
            block_map[block_id] = {
                "page": page_num,
                "bbox": block["bbox"],
                "color": block["lines"][0]["spans"][0]["color"],
                "size": block["lines"][0]["spans"][0]["size"],
                "font": block["lines"][0]["spans"][0]["font"],
            }
            
    doc.close()
    
    if not xml_blocks:
        raise Exception("Input PDF is empty or non-parseable")
        
    # Create Phase 1 temp files
    # 1. Template layout metadata file
    temp_template = tempfile.NamedTemporaryFile(mode='w', suffix='_layout.json', delete=False)
    template_data = {
        "input_path": input_path,
        "block_map": block_map
    }
    json.dump(template_data, temp_template)
    temp_template.close()
    
    # 2. Source text file for translation
    temp_source = tempfile.NamedTemporaryFile(mode='w', suffix='_source.md', delete=False)
    temp_source.write("\n".join(xml_blocks))
    temp_source.close()
    
    log_event("INFO", f"Phase 1 PDF Extraction complete. Template layout temp: {temp_template.name}, Source XML temp: {temp_source.name}")
    return temp_template.name, temp_source.name


def translate_source_temp(source_temp_path, job, config_settings, prompt_template):
    with open(source_temp_path, 'r', encoding='utf-8') as f:
        source_doc_xml = f.read()
        
    # Fetch reference materials
    corpus_csv = get_gcs_file_text(config_settings["corpus_file"])
    dnt_csv = get_gcs_file_text(config_settings["dnt_file"])
    
    # Rebuild final prompt from template
    prompt = prompt_template
    prompt = prompt.replace("[Source Language]", job["source_lang"])
    prompt = prompt.replace("[Target Language]", job["target_lang"])
    prompt = prompt.replace("[Paste your CSV text of known translations here. Format: Source Text, Target Translation]", corpus_csv)
    prompt = prompt.replace("[Paste your list of names, brands, and product titles here, one per line or comma-separated]", dnt_csv)
    prompt = prompt.replace("[Paste the document text you want translated here]", source_doc_xml)
    
    # Run translation
    model_to_use = job["model_override"] if job["model_override"] else config_settings["model"]
    verbose = bool(job.get("verbose", False))
    translated_xml, tokens_used = run_gemini_translation(prompt, model_to_use, verbose=verbose)
    
    # Overwrite source temp file with translated XML blocks
    with open(source_temp_path, 'w', encoding='utf-8') as f:
        f.write(translated_xml)
        
    log_event("INFO", f"Phase 2 Translation complete. Overwrote source XML temp: {source_temp_path}")
    return tokens_used


def merge_pdf_from_temps(layout_json_path, translated_xml_path, output_path):
    with open(layout_json_path, 'r', encoding='utf-8') as f:
        layout_data = json.load(f)
        
    input_path = layout_data["input_path"]
    block_map = layout_data["block_map"]
    
    with open(translated_xml_path, 'r', encoding='utf-8') as f:
        translated_xml = f.read()
        
    translated_map = {}
    matches = re.findall(r'<block id="([^"]+)">([\s\S]*?)</block>', translated_xml)
    for block_id, text in matches:
        translated_map[block_id] = text.strip()
        
    def find_fitting_fontsize(rect, text, start_fontsize, fontname):
        temp_doc = fitz.open()
        temp_page = temp_doc.new_page(width=max(rect.x1 + 100, 100), height=max(rect.y1 + 100, 100))
        fontsize = start_fontsize
        while fontsize >= 2.0:
            ret = temp_page.insert_textbox(
                rect,
                text,
                fontsize=fontsize,
                fontname=fontname
            )
            if ret >= 0:
                temp_doc.close()
                return fontsize
            fontsize -= 0.5
        temp_doc.close()
        return 2.0

    out_doc = fitz.open(input_path)
    page_blocks = {}
    for block_id, orig_meta in block_map.items():
        translated_text = translated_map.get(block_id)
        if not translated_text:
            continue
        page_num = orig_meta["page"]
        if page_num not in page_blocks:
            page_blocks[page_num] = []
        page_blocks[page_num].append((block_id, orig_meta, translated_text))
        
    for page_num, blocks in page_blocks.items():
        page = out_doc[page_num]
        
        # 1. Add redactions for page
        for block_id, orig_meta, translated_text in blocks:
            rect = fitz.Rect(orig_meta["bbox"])
            page.add_redact_annot(rect, fill=(1, 1, 1))
            
        # 2. Apply redactions
        page.apply_redactions()
        
        # 3. Draw text
        for block_id, orig_meta, translated_text in blocks:
            rect = fitz.Rect(orig_meta["bbox"])
            color_int = orig_meta["color"]
            r = ((color_int >> 16) & 0xFF) / 255.0
            g = ((color_int >> 8) & 0xFF) / 255.0
            b = (color_int & 0xFF) / 255.0
            
            if r > 0.8 and g > 0.8 and b > 0.8:
                color_rgb = (0, 0, 0)
            else:
                color_rgb = (r, g, b)
                
            fit_size = find_fitting_fontsize(rect, translated_text, orig_meta["size"] * 0.95, "helv")
            try:
                page.insert_textbox(
                    rect, 
                    translated_text, 
                    fontsize=fit_size,
                    fontname="helv", 
                    color=color_rgb
                )
            except Exception as draw_err:
                log_event("ERROR", f"Error rendering text on PDF block {block_id}: {draw_err}")
                
    out_doc.save(output_path)
    out_doc.close()
    log_event("INFO", f"Phase 3 PDF Merge complete. Candidate PDF saved: {output_path}")


def translate_pdf_file(input_path, output_path, job, config_settings, prompt_template):
    layout_temp, source_temp = extract_pdf_to_temps(input_path)
    try:
        tokens_used = translate_source_temp(source_temp, job, config_settings, prompt_template)
        merge_pdf_from_temps(layout_temp, source_temp, output_path)
        return tokens_used
    finally:
        if os.path.exists(layout_temp): os.remove(layout_temp)
        if os.path.exists(source_temp): os.remove(source_temp)


# Helper to clean up old files owned by the service account to free up storage quota
def cleanup_old_drive_files(drive_service):
    try:
        log_event("INFO", "Running Google Drive cleanup to free storage quota...")
        
        # Log quota information
        try:
            about = drive_service.about().get(fields="storageQuota").execute()
            quota = about.get("storageQuota", {})
            log_event("INFO", f"Google Drive Quota: Limit={quota.get('limit')}, Usage={quota.get('usage')}")
        except Exception as q_err:
            log_event("WARNING", f"Failed to check Google Drive quota: {q_err}")
        
        # Empty trash first to reclaim storage quota
        try:
            drive_service.files().emptyTrash().execute()
            log_event("INFO", "Google Drive trash emptied successfully.")
        except Exception as trash_err:
            log_event("WARNING", f"Failed to empty Drive trash: {trash_err}")
            
        # Use 'me' in owners to target files owned by the service account
        query = "'me' in owners"
        results = drive_service.files().list(
            q=query,
            pageSize=100,
            fields="files(id, name)"
        ).execute()
        files = results.get('files', [])
        log_event("INFO", f"Drive cleanup found {len(files)} files owned by the service account.")
        for f in files:
            try:
                drive_service.files().delete(fileId=f['id']).execute()
                log_event("INFO", f"Deleted old candidate file {f['name']} (ID: {f['id']})")
            except Exception as e:
                print(f"Failed to delete old file {f['id']}: {e}")
        log_event("INFO", "Google Drive cleanup completed.")
    except Exception as e:
        log_event("WARNING", f"Google Drive cleanup failed: {e}")


# Helper to recursively extract paragraphs from structural elements
def extract_paragraphs_from_elements(elements):
    paras = []
    for el in elements:
        if "paragraph" in el:
            paras.append(el["paragraph"])
        elif "table" in el:
            for row in el["table"].get("tableRows", []):
                for cell in row.get("tableCells", []):
                    paras.extend(extract_paragraphs_from_elements(cell.get("content", [])))
        elif "tableOfContents" in el:
            paras.extend(extract_paragraphs_from_elements(el["tableOfContents"].get("content", [])))
    return paras


# Core Google Docs Translation

def extract_gdoc_to_temps(drive_url, job, docs_service, drive_service, destination_url=None):
    match = re.search(r"/document/d/([a-zA-Z0-9-_]+)", drive_url)
    if not match:
        raise Exception("Invalid Google Drive Document URL")
    doc_id = match.group(1)
    
    doc = docs_service.documents().get(documentId=doc_id).execute()
    doc_title = doc.get("title", "Untitled Document")
    
    if destination_url:
        dest_match = re.search(r"/document/d/([a-zA-Z0-9-_]+)", destination_url)
        if not dest_match:
            dest_doc_id = destination_url
        else:
            dest_doc_id = dest_match.group(1)

        log_event("INFO", f"Exporting source document {doc_id} to DOCX...")
        export_req = drive_service.files().export_media(
            fileId=doc_id,
            mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        docx_bytes = export_req.execute()

        log_event("INFO", f"Overwriting destination Google Doc {dest_doc_id} with source DOCX bytes...")
        from googleapiclient.http import MediaIoBaseUpload
        import io

        media = MediaIoBaseUpload(
            io.BytesIO(docx_bytes),
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            resumable=True
        )

        drive_service.files().update(
            fileId=dest_doc_id,
            media_body=media
        ).execute()

        target_doc_id = dest_doc_id
    else:
        log_event("INFO", f"Copying source document {doc_id} to candidate file...")
        cand_title = f"{doc_title}_translation_candidate_{job['target_lang']}"
        copied_file = drive_service.files().copy(
            fileId=doc_id, 
            body={"name": cand_title}
        ).execute()
        target_doc_id = copied_file.get("id")

    target_doc = docs_service.documents().get(documentId=target_doc_id).execute()
    target_body = target_doc.get("body", {}).get("content", [])
    
    all_paras = extract_paragraphs_from_elements(target_body)
    paragraphs_to_translate = []
    para_runs = {}
    
    for idx, para in enumerate(all_paras):
        para_text = ""
        elements = para.get("elements", [])
        text_runs = []
        for el in elements:
            if "textRun" in el:
                para_text += el["textRun"].get("content", "")
                text_runs.append({
                    "startIndex": el.get("startIndex"),
                    "endIndex": el.get("endIndex"),
                    "content": el["textRun"].get("content", "")
                })
        clean_text = para_text.strip()
        if clean_text:
            para_id = f"para_{idx}"
            paragraphs_to_translate.append(f'<block id="{para_id}">{clean_text}</block>')
            para_runs[para_id] = text_runs
            
    temp_template = tempfile.NamedTemporaryFile(mode='w', suffix='_gdoc_layout.json', delete=False)
    template_data = {
        "target_doc_id": target_doc_id,
        "para_runs": para_runs,
        "destination_url": destination_url
    }
    json.dump(template_data, temp_template)
    temp_template.close()
    
    temp_source = tempfile.NamedTemporaryFile(mode='w', suffix='_gdoc_source.md', delete=False)
    temp_source.write("\n".join(paragraphs_to_translate))
    temp_source.close()
    
    log_event("INFO", f"Phase 1 GDoc Extraction complete. Template layout temp: {temp_template.name}, Source XML temp: {temp_source.name}")
    return temp_template.name, temp_source.name


def merge_gdoc_from_temps(layout_json_path, translated_xml_path, docs_service, job):
    with open(layout_json_path, 'r', encoding='utf-8') as f:
        layout_data = json.load(f)
        
    target_doc_id = layout_data["target_doc_id"]
    para_runs = layout_data["para_runs"]
    destination_url = layout_data["destination_url"]
    
    with open(translated_xml_path, 'r', encoding='utf-8') as f:
        translated_xml = f.read()
        
    translated_map = {}
    matches = re.findall(r'<block id="([^"]+)">([\s\S]*?)</block>', translated_xml)
    for block_id, text in matches:
        translated_map[block_id] = text.strip()
        
    update_ops = []
    for block_id, translated_text in translated_map.items():
        text_runs = para_runs.get(block_id)
        if not text_runs:
            continue
            
        for run in text_runs:
            start = run.get("startIndex")
            end = run.get("endIndex")
            run_text = run.get("content", "")
            
            if run_text.endswith("\n"):
                target_end = end - 1
            else:
                target_end = end
                
            if start < target_end:
                update_ops.append((start, 0, {
                    "deleteContentRange": {
                        "range": {
                            "startIndex": start,
                            "endIndex": target_end
                        }
                    }
                }))
                
        first_run_start = text_runs[0].get("startIndex")
        update_ops.append((first_run_start, 1, {
            "insertText": {
                "location": {
                    "index": first_run_start
                },
                "text": translated_text
            }
        }))
        
    # Add translation header statement at index 1
    timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    statement = f"Translated with Gemini by Translation Center from {job['source_lang']} to {job['target_lang']} on {timestamp_str}\n"
    update_ops.append((1, 2, {
        "insertText": {
            "location": {
                "index": 1
            },
            "text": statement
        }
    }))
    
    update_ops.sort(key=lambda x: (-x[0], x[1]))
    requests = [op[2] for op in update_ops]
    
    if requests:
        docs_service.documents().batchUpdate(
            documentId=target_doc_id,
            body={"requests": requests}
        ).execute()
        
    if destination_url:
        return destination_url
    else:
        return f"https://docs.google.com/document/d/{target_doc_id}/edit"


def translate_google_doc(drive_url, job, config_settings, prompt_template, destination_url=None):
    drive_service, docs_service = get_google_services()
    if not drive_service or not docs_service:
        raise Exception("Google APIs not authenticated or unavailable")
        
    cleanup_old_drive_files(drive_service)
    
    layout_temp, source_temp = extract_gdoc_to_temps(drive_url, job, docs_service, drive_service, destination_url)
    try:
        with open(source_temp, 'r', encoding='utf-8') as f:
            source_content = f.read().strip()
            
        if not source_content:
            if destination_url:
                return destination_url, 0
            else:
                with open(layout_temp, 'r') as lf:
                    layout_data = json.load(lf)
                return f"https://docs.google.com/document/d/{layout_data['target_doc_id']}/edit", 0
                
        tokens_used = translate_source_temp(source_temp, job, config_settings, prompt_template)
        cand_url = merge_gdoc_from_temps(layout_temp, source_temp, docs_service, job)
        return cand_url, tokens_used
    finally:
        if os.path.exists(layout_temp): os.remove(layout_temp)
        if os.path.exists(source_temp): os.remove(source_temp)

# Main Job Processing Runner
def process_translation_job(job_id):
    job = get_job(job_id)
    if not job:
        log_event("ERROR", f"Job ID {job_id} not found in database.")
        return
        
    update_job_status(job_id, "TRANSLATING")
    
    try:
        # Load configs
        config_settings = parse_translation_config()
        
        # Load prompt template from GCS config bucket
        client = storage.Client()
        bucket = client.bucket(CONFIG_BUCKET)
        blob = bucket.blob("translation_prompt.md")
        if blob.exists():
            prompt_template = blob.download_as_text()
        else:
            # Fallback to local root workspace file
            local_prompt_path = os.path.join(os.path.dirname(__file__), "../translation_prompt.md")
            with open(local_prompt_path, "r", encoding="utf-8") as f:
                prompt_template = f.read()
                
        # Handle file parsing based on GCS or Google Drive
        if job["storage_type"] == "gcs":
            # GCS Download
            src_uri = job["source_file_path"]
            parts = src_uri.replace("gs://", "").split("/")
            bucket_name = parts[0]
            blob_name = "/".join(parts[1:])
            
            temp_in = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
            temp_in_path = temp_in.name
            temp_in.close()
            
            client.bucket(bucket_name).blob(blob_name).download_to_filename(temp_in_path)
            
            # Prepare Output file
            temp_out_path = temp_in_path + "_out.pdf"
            
            # Run PDF Translation
            tokens_used = translate_pdf_file(
                temp_in_path, 
                temp_out_path, 
                job, 
                config_settings, 
                prompt_template
            )
            
            # Upload Candidate to Output GCS bucket
            dir_part, file_part = os.path.split(blob_name)
            name_part, ext_part = os.path.splitext(file_part)
            cand_filename = f"{name_part}_translation_candidate_{job['target_lang']}{ext_part}"
            if dir_part:
                cand_filename = f"{dir_part}/{cand_filename}"
            cand_uri = f"gs://{OUTPUT_BUCKET}/{cand_filename}"
            client.bucket(OUTPUT_BUCKET).blob(cand_filename).upload_from_filename(temp_out_path)
            
            # Cleanup local temp files
            if os.path.exists(temp_in_path): os.remove(temp_in_path)
            if os.path.exists(temp_out_path): os.remove(temp_out_path)
            
            # Log usage & update DB status
            log_tokens(job_id, tokens_used)
            model_to_use = job["model_override"] if job["model_override"] else config_settings["model"]
            update_job_status(job_id, "PENDING_REVIEW", cand_uri, model_to_use)
            
        else:
            # Google Drive URL
            drive_url = job["source_file_path"]
            if job["file_type"] == "gdoc":
                destination_url = job.get("candidate_file_path")
                cand_url, tokens_used = translate_google_doc(
                    drive_url, 
                    job, 
                    config_settings, 
                    prompt_template,
                    destination_url=destination_url
                )
                log_tokens(job_id, tokens_used)
                model_to_use = job["model_override"] if job["model_override"] else config_settings["model"]
                update_job_status(job_id, "PENDING_REVIEW", cand_url, model_to_use)
            else:
                # PDF Google Drive download, translate local PDF, upload translated back to Drive
                # For simplicity, download GDrive file bytes and overlay them
                drive_service, docs_service = get_google_services()
                if not drive_service:
                    raise Exception("Google API client credentials missing")
                    
                match = re.search(r"/file/d/([a-zA-Z0-9-_]+)", drive_url)
                if not match:
                    # Alternative drive patterns
                    match = re.search(r"id=([a-zA-Z0-9-_]+)", drive_url)
                if not match:
                    raise Exception("Invalid Google Drive File Link")
                file_id = match.group(1)
                
                # Fetch metadata
                meta = drive_service.files().get(fileId=file_id).execute()
                title = meta.get("name", "Document.pdf")
                
                temp_in = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
                temp_in_path = temp_in.name
                temp_in.close()
                
                # Download bytes
                from googleapiclient.http import MediaIoBaseDownload
                import io
                request = drive_service.files().get_media(fileId=file_id)
                fh = io.FileIO(temp_in_path, 'wb')
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while not done:
                    status, done = downloader.next_chunk()
                    
                # Output filename & run translation overlay
                temp_out_path = temp_in_path + "_out.pdf"
                tokens_used = translate_pdf_file(
                    temp_in_path, 
                    temp_out_path, 
                    job, 
                    config_settings, 
                    prompt_template
                )
                
                # Upload candidate PDF copy back to Google Drive
                from googleapiclient.http import MediaFileUpload
                cand_title = f"{title.replace('.pdf', '')}_translation_candidate_{job['target_lang']}.pdf"
                media = MediaFileUpload(temp_out_path, mimetype='application/pdf')
                uploaded_file = drive_service.files().create(
                    body={"name": cand_title, "mimeType": "application/pdf"},
                    media_body=media
                ).execute()
                cand_url = f"https://drive.google.com/file/d/{uploaded_file.get('id')}/view"
                
                # Clean local temporary files
                if os.path.exists(temp_in_path): os.remove(temp_in_path)
                if os.path.exists(temp_out_path): os.remove(temp_out_path)
                
                log_tokens(job_id, tokens_used)
                model_to_use = job["model_override"] if job["model_override"] else config_settings["model"]
                update_job_status(job_id, "PENDING_REVIEW", cand_url, model_to_use)
                
    except Exception as e:
        log_event("ERROR", f"Job ID {job_id} failed during translation: {e}")
        update_job_status(job_id, "FAILED")
        print(f"Error executing translation: {e}", file=sys.stderr)
