import os
import fitz

def find_fitting_fontsize(rect, text, start_fontsize, fontname):
    # Try different font sizes from start_fontsize down to 2
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
    
    doc = fitz.open(spanish_pdf_path)
    page = doc[0]
    page_dict = page.get_text("dict")
    
    blocks_to_draw = []
    for b_idx, block in enumerate(page_dict.get("blocks", [])):
        if "lines" not in block:
            continue
        
        block_text = ""
        for line in block["lines"]:
            for span in line["spans"]:
                block_text += span["text"] + " "
        block_text = block_text.strip()
        
        blocks_to_draw.append({
            "id": f"p0_b{b_idx}",
            "bbox": block["bbox"],
            "size": block["lines"][0]["spans"][0]["size"],
            "color": block["lines"][0]["spans"][0]["color"],
            "text": block_text
        })
        
    # Translate mapping mock
    translated = {
        "p0_b0": "OF CON",
        "p0_b1": "FINSA GROUP",
        "p0_b2": "CODE",
        "p0_b3": "DUCT",
        "p0_b4": "20 25"
    }
    
    out_doc = fitz.open(spanish_pdf_path)
    page = out_doc[0]
    
    # Redact
    for b in blocks_to_draw:
        rect = fitz.Rect(b["bbox"])
        page.add_redact_annot(rect, fill=(1, 1, 1))
    page.apply_redactions()
    
    # Draw
    print("--- Dynamic Font Sizing Results ---")
    for b in blocks_to_draw:
        rect = fitz.Rect(b["bbox"])
        orig_size = b["size"] * 0.95
        
        # Find fitting size
        fit_size = find_fitting_fontsize(rect, translated[b["id"]], orig_size, "helv")
        
        color_int = b["color"]
        r = ((color_int >> 16) & 0xFF) / 255.0
        g = ((color_int >> 8) & 0xFF) / 255.0
        b_val = (color_int & 0xFF) / 255.0
        color_rgb = (0, 0, 0) if (r > 0.8 and g > 0.8 and b_val > 0.8) else (r, g, b_val)
        
        ret = page.insert_textbox(
            rect,
            translated[b["id"]],
            fontsize=fit_size,
            fontname="helv",
            color=color_rgb
        )
        print(f"Block {b['id']}: orig_size={orig_size:.2f} fit_size={fit_size:.2f} ret={ret} text='{translated[b['id']]}'")
        
    out_doc.save("scratch/test_page0_fit_out.pdf")
    out_doc.close()
    doc.close()
    
    # Check extracted text
    test_doc = fitz.open("scratch/test_page0_fit_out.pdf")
    print("\nExtracted text from page 0:")
    print(repr(test_doc[0].get_text()))
    test_doc.close()

if __name__ == "__main__":
    main()
