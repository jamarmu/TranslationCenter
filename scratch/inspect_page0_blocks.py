import os
import fitz

def main():
    spanish_pdf_name = [x for x in os.listdir('scratch') if '1780593794780' in x][0]
    spanish_pdf_path = os.path.join('scratch', spanish_pdf_name)
    
    doc = fitz.open(spanish_pdf_path)
    page = doc[0]
    page_dict = page.get_text("dict")
    
    print("=== Page 0 Blocks ===")
    for b_idx, block in enumerate(page_dict.get("blocks", [])):
        if "lines" not in block:
            print(f"Block {b_idx}: No lines (likely image or drawing)")
            continue
            
        print(f"\nBlock {b_idx}: bbox={block['bbox']}")
        for l_idx, line in enumerate(block["lines"]):
            for s_idx, span in enumerate(line["spans"]):
                print(f"  Span: text='{span['text']}' font='{span['font']}' size={span['size']:.2f} color={span['color']} color_hex=0x{span['color']:06X}")

if __name__ == "__main__":
    main()
