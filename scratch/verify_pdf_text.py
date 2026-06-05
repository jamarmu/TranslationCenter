import fitz
from google.cloud import storage

def main():
    try:
        bucket_name = "californiahotel_translation_output_files"
        blob_name = "12_translation_candidate_English.pdf"
        
        print(f"Downloading gs://{bucket_name}/{blob_name}...")
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        
        local_path = "/Users/jamarmu/Workdir/Antigravity/Transfinsa/TranslationCenter/scratch/translated_candidate.pdf"
        blob.download_to_filename(local_path)
        print("Download successful!")
        
        doc = fitz.open(local_path)
        print(f"Number of pages: {len(doc)}")
        
        print("\n--- Page 1 Text ---")
        page = doc[0]
        text = page.get_text()
        print(text)
        
        doc.close()
    except Exception as e:
        print(f"Failed to verify PDF text: {e}")

if __name__ == "__main__":
    main()
