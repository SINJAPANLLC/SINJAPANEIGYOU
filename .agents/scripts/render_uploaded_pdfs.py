from pathlib import Path
import fitz


FILES = [
    Path("attached_assets/SIN_JAPAN_Amazon資料260730_1787836512411.pdf"),
    Path("attached_assets/SIN_JAPAN_採用面談資料260730_1787836512411.pdf"),
]
OUTPUT_DIR = Path(".agents/outputs/uploaded-pdfs")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

for file_path in FILES:
    document = fitz.open(file_path)
    print(f"{file_path.name}: {document.page_count} pages")
    for page_number, page in enumerate(document, start=1):
        image_path = OUTPUT_DIR / f"{file_path.stem}-page-{page_number}.png"
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        pixmap.save(image_path)
        print(f"  rendered {image_path}")