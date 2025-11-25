import requests, time, sys

BASE = "http://127.0.0.1:8000"

print("="  * 70)
print("RAG-LMS FULL API TEST - Phase 1 & 2 Verification")
print("=" * 70)

try:
    # Health check
    print("\n🔍 Health Check...")
    try:
        r = requests.get(f"{BASE}/health")
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to API. Is it running?")
        sys.exit(1)
        
    if r.status_code != 200:
        print(f"❌ Health check failed: {r.status_code}")
        sys.exit(1)
        
    health = r.json()
    print(f"✓ API Status: {health['status']}")
    print(f"  Model: {health['embedding_model']}")
    print(f"  Embedding Dim: {health['embedding_dim']}")
    
    # 1. Create chatbot
    print("\n1️⃣ Creating Physics Assistant Chatbot...")
    r = requests.post(f"{BASE}/chatbots/create", data={
        "name": "Physics Assistant", 
        "greeting": "Hello! I can help with physics questions.",
        "external_knowledge_ratio": 0.5
    })
    bot_id = r.json()["id"]
    print(f"✓ Chatbot Created")
    print(f"  ID: {bot_id}")
    
    # 2. Upload document
    print("\n2️⃣ Uploading physics_test.pdf...")
    start = time.time()
    with open("physics_test.pdf", "rb") as f:
        r = requests.post(f"{BASE}/chatbots/{bot_id}/upload", 
                         files={"file": ("physics_test.pdf", f, "application/pdf")})
    upload_time = time.time() - start
    
    if r.status_code != 200:
        print(f"❌ Upload failed: {r.text}")
        sys.exit(1)
        
    data = r.json()
    print(f"✓ Upload Complete ({upload_time:.1f}s)")
    print(f"  Chunks Created: {data['chunks']}")
    print(f"  Total Docs in Index: {data['stats']['total_docs']}")
    
    # 3. Test Chat with Hybrid Retrieval
    print("\n3️⃣ Testing Hybrid Retrieval Chat...")
    start = time.time()
    r = requests.post(f"{BASE}/chatbots/{bot_id}/chat", data={
        "question": "What is Newton's first law of motion?",
        "top_k": 3
    })
    query_time = time.time() - start
    
    if r.status_code != 200:
        print(f"❌ Chat failed: {r.text}")
        sys.exit(1)
        
    data = r.json()
    print(f"✓ Query Complete ({query_time*1000:.0f}ms)")
    print(f"\n📝 LLM Answer:")
    print(f"  {data['answer'][:200]}...")
    
    print(f"\n📊 Retrieved Sources (Hybrid BM25 + FAISS):")
    for i, src in enumerate(data['sources'][:3], 1):
        print(f"\n  Source {i}:")
        print(f"    Hybrid Score: {src['hybrid_score']:.3f}")
        print(f"    ├─ BM25 Score: {src.get('bm25_score', 0):.3f} (keyword match)")
        print(f"    └─ FAISS Similarity: {src.get('faiss_similarity', 0):.3f} (semantic)")
        print(f"    Page: {src.get('page', '?')}")
        print(f"    Text: {src['text'][:80]}...")
    
    # 4. List all chatbots
    print("\n4️⃣ Listing All Chatbots...")
    r = requests.get(f"{BASE}/chatbots/list")
    bots = r.json()['chatbots']
    print(f"✓ Found {len(bots)} chatbot(s)")
    for bot in bots:
        print(f"  - {bot['name']} (created: {bot['created_at']})")
    
    print("\n" + "=" * 70)
    print("✅ ALL TESTS PASSED - System Working Perfectly!")
    print("=" * 70)
    
except Exception as e:
    print(f"\n❌ Test Failed: {e}")
    import traceback
    traceback.print_exc()
