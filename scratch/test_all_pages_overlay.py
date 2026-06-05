import os
import re
import fitz
import requests

def find_fitting_fontsize(rect, text, start_fontsize, fontname):
    temp_doc = fitz.open()
    temp_page = temp_doc.new_page(width=rect.x1 + 100, height=rect.y1 + 100)
    
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

def main():
    spanish_pdf_name = [x for x in os.listdir('scratch') if '1780593794780' in x][0]
    spanish_pdf_path = os.path.join('scratch', spanish_pdf_name)
    
    # Login to get token
    login_res = requests.post("http://127.0.0.1:8080/api/login", json={
        "username": "admin1",
        "password": "123Translate"
    })
    token = login_res.json()["token"]
    
    # Get logs
    logs_res = requests.get("http://127.0.0.1:8080/api/admin/logs?timeframe=24h", headers={
        "Authorization": f"Bearer {token}"
    })
    logs = logs_res.json()
    
    response_log = next(l for l in logs if l["id"] == 129)
    translated_xml = response_log["message"]
    
    translated_map = {}
    matches = re.findall(r'<block id="([^"]+)">([\s\S]*?)</block>', translated_xml)
    for block_id, text in matches:
        translated_map[block_id] = text.strip()
        
    doc = fitz.open(spanish_pdf_path)
    
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
        
    print("=== Analyzing insert_textbox return values with dynamic sizing ===")
    
    total_blocks = 0
    failed_blocks = 0
    
    for page_num in sorted(page_blocks.keys()):
        page = out_doc[page_num]
        
        # Redact
        for block_id, orig_meta, translated_text in page_blocks[page_num]:
            rect = fitz.Rect(orig_meta["bbox"])
            page.add_redact_annot(rect, fill=(1, 1, 1))
        page.apply_redactions()
        
        # Draw
        for block_id, orig_meta, translated_text in page_blocks[page_num]:
            rect = fitz.Rect(orig_meta["bbox"])
            orig_size = orig_meta["size"] * 0.95
            
            fit_size = find_fitting_fontsize(rect, translated_text, orig_size, "helv")
            
            color_int = orig_meta["color"]
            r = ((color_int >> 16) & 0xFF) / 255.0
            g = ((color_int >> 8) & 0xFF) / 255.0
            b = (color_int & 0xFF) / 255.0
            color_rgb = (0, 0, 0) if (r > 0.8 and g > 0.8 and b > 0.8) else (r, g, b)
            
            ret = page.insert_textbox(
                rect,
                translated_text,
                fontsize=fit_size,
                fontname="helv",
                color=color_rgb
            )
            
            total_blocks += 1
            if ret < 0:
                failed_blocks += 1
                print(f"Page {page_num} Block {block_id} FAILED: size={orig_meta['size']:.2f} fit_size={fit_size:.2f} ret={ret:.2f} bbox={orig_meta['bbox']} text='{translated_text}'")
            # else:
            #     print(f"Page {page_num} Block {block_id} SUCCEEDED: fit_size={fit_size:.2f}")
                
    print(f"\nSummary: {failed_blocks} out of {total_blocks} blocks failed to draw.")
    
    # Save the output PDF to verify text extraction
    out_doc.save("scratch/test_all_fit_out.pdf")
    out_doc.close()
    doc.close()
    
    # Check text count
    test_doc = fitz.open("scratch/test_all_fit_out.pdf")
    print("\nText checking on first page:")
    print(repr(test_doc[0].get_text()))
    test_doc.close()

if __name__ == "__main__":
    main()
