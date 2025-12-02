import sys
import json

# Check what TOC is stored in the vector database
chatbot_id = input("Enter chatbot ID (from URL): ")

# Load the metadata
meta_path = f"data/vectorstore_{chatbot_id}_meta.json"

try:
    with open(meta_path, 'r') as f:
        meta = json.load(f)
    
    # Find the TOC chunk
    for doc_id, doc in meta['docs'].items():
        if 'Table of Contents' in doc.get('text', ''):
            print("\n=== FOUND TOC CHUNK ===")
            print(doc['text'])
            print("\n=== END ===")
            break
    else:
        print("No TOC chunk found!")
        
except FileNotFoundError:
    print(f"❌ File not found: {meta_path}")
    print("Make sure you've uploaded a document first.")
