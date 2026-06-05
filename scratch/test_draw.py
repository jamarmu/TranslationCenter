import os
import re
import fitz
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    connection_args = {
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD", "password"),
        "database": os.getenv("DB_NAME", "translation_center"),
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", 3306))
    }
    return mysql.connector.connect(**connection_args)

def main():
    # Find the Spanish PDF
    spanish_pdf_name = [x for x in os.listdir('scratch') if '1780593794780' in x][0]
    spanish_pdf_path = os.path.join('scratch', spanish_pdf_name)
    print(f"Original Spanish PDF: {spanish_pdf_path}")
    
    # Connect to DB and get Gemini response for Job 12
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT message FROM app_logs WHERE id = 129")
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        print("Could not find log ID 129 in the database.")
        return
        
    translated_xml = row['message']
    
    # Parse translated XML blocks
    translated_map = {}
    matches = re.findall(r'<block id="([^"]+)">([\s\S]*?)</block>', translated_xml)
    for block_id, text in matches:
        translated_map[block_id] = text.strip()
        
    print(f"Parsed {len(translated_map)} translated blocks from log ID 129.")
    
    # Open original PDF
    doc = fitz.open(spanish_pdf_path)
    
    # Extract blocks to build block_map
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
            block_map[block_id] = {
                "page": page_num,
                "bbox": block["bbox"],
                "color": block["lines"][0]["spans"][0]["color"],
                "size": block["lines"][0]["spans"][0]["size"],
                "font": block["lines"][0]["spans"][0]["font"],
            }

    # Rebuild PDF Overlay page-by-page
    out_doc = fitz.open(spanish_pdf_path)
    
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
        
        # 1. Add all redactions for this page
        for block_id, orig_meta, translated_text in blocks:
            rect = fitz.Rect(orig_meta["bbox"])
            page.add_redact_annot(rect, fill=(1, 1, 1))
            
        # 2. Apply all redactions
        page.apply_redactions()
        
        # 3. Draw text and check return values
        print(f"\n--- Page {page_num} Drawing Status ---")
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
                
            # Let's see the text and box
            ret = page.insert_textbox(
                rect, 
                translated_text, 
                fontsize=orig_meta["size"] * 0.95,
                fontname="helv", 
                color=color_rgb
            )
            print(f"Block {block_id}: bbox={orig_meta['bbox']} font_size={orig_meta['size']:.2f} font={orig_meta['font']} color={color_rgb} ret={ret} text='{translated_text}'")
            
    out_doc.close()
    doc.close()

if __name__ == "__main__":
    main()
