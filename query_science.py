import requests, os, sys, time

BASE = "http://127.0.0.1:8000"
PDF_PATH = "fin_ed_docs/grade-10-science-and-technology-part-i.pdf"

def run():
    print("="*60)
    print("QUERYING SCIENCE TEXTBOOK")
    print("="*60)

    # 1. Find or Create Chatbot
    print("\n1. Finding Chatbot...")
    try:
        r = requests.get(f"{BASE}/chatbots/list")
        chatbots = r.json()["chatbots"]
    except requests.exceptions.ConnectionError:
        print("❌ API is not running.")
        sys.exit(1)

    bot_id = None
    for bot in chatbots:
        if "Science" in bot["name"]:
            bot_id = bot["id"]
            print(f"✓ Found existing chatbot: {bot['name']} ({bot_id})")
            break
    
    if not bot_id:
        print("  Creating new Science Chatbot...")
        r = requests.post(f"{BASE}/chatbots/create", data={
            "name": "Grade 10 Science Bot",
            "greeting": "Hello student!",
            "external_knowledge_ratio": 0.2
        })
        bot_id = r.json()["id"]
        print(f"✓ Created: {bot_id}")

    # 2. Check if PDF is indexed
    print("\n2. Checking Documents...")
    r = requests.get(f"{BASE}/chatbots/{bot_id}/documents")
    docs = r.json()["documents"]
    
    is_indexed = False
    for d in docs:
        if "grade-10" in d["filename"].lower():
            is_indexed = True
            print(f"✓ Textbook found: {d['filename']} ({d['chunk_count']} chunks)")
            break
            
    if not is_indexed:
        print(f"  Textbook NOT found. Uploading {os.path.basename(PDF_PATH)}...")
        if not os.path.exists(PDF_PATH):
            print(f"❌ File not found: {PDF_PATH}")
            sys.exit(1)
            
        print("  ⏳ Uploading and processing (this may take 1-2 mins)...")
        start = time.time()
        with open(PDF_PATH, "rb") as f:
            r = requests.post(f"{BASE}/chatbots/{bot_id}/upload", 
                             files={"file": (os.path.basename(PDF_PATH), f, "application/pdf")})
        
        if r.status_code != 200:
            print(f"❌ Upload failed: {r.text}")
            sys.exit(1)
            
        print(f"✓ Uploaded in {time.time()-start:.1f}s")

    # 3. Query
    question = "What are the chapters listed in the Table of Contents? specifically the first one."
    print(f"\n3. Querying: '{question}'")
    
    r = requests.post(f"{BASE}/chatbots/{bot_id}/chat", data={
        "question": question,
        "top_k": 10  # Increased top_k to find TOC
    })
    
    data = r.json()
    print(f"\n📝 Answer:\n{data['answer']}")
    print("\n📊 Sources:")
    for src in data['sources'][:3]:
        print(f"  - Page {src.get('page')}: {src['text'][:60]}...")

if __name__ == "__main__":
    run()
