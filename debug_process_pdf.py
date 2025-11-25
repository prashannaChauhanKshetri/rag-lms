import sys
from utils import process_pdf

def main():
    path = "fin_ed_docs/grade-10-science-and-technology-part-i.pdf"
    with open(path, "rb") as f:
        data = f.read()
    chunks = process_pdf(data)
    print(f"Total chunks: {len(chunks)}")
    for i, c in enumerate(chunks[:5]):
        print(f"Chunk {i+1}: page {c['page']}, chapter {c.get('chapter')}, len {len(c['text'])}")

if __name__ == "__main__":
    main()
