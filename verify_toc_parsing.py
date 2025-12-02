import json
from typing import Dict

def mock_extract_toc_logic(mock_response_content: str) -> Dict[int, str]:
    """
    Simulates the parsing logic inside extract_toc_with_qwen
    """
    toc_map = {}
    content = mock_response_content.replace("```json", "").replace("```", "").strip()
    
    try:
        page_toc = json.loads(content)
        if page_toc:
            # Convert keys to int and update map
            for p, title in page_toc.items():
                try:
                    toc_map[int(p)] = title
                except:
                    pass
    except json.JSONDecodeError:
        print("JSON Decode Error")
        pass 
        
    return toc_map

def test_parsing():
    # Test Case 1: Standard Unit
    response1 = '```json\n{"1": "Unit 1: Algebra", "15": "Unit 2: Geometry"}\n```'
    result1 = mock_extract_toc_logic(response1)
    print(f"Test 1 (Units): {result1}")
    assert result1 == {1: "Unit 1: Algebra", 15: "Unit 2: Geometry"}

    # Test Case 2: Chapters and Sections (New format)
    response2 = '{"5": "Chapter 1: Intro", "20": "Section 2.1: Basics", "35": "3. Advanced"}'
    result2 = mock_extract_toc_logic(response2)
    print(f"Test 2 (Mixed): {result2}")
    assert result2 == {5: "Chapter 1: Intro", 20: "Section 2.1: Basics", 35: "3. Advanced"}

    # Test Case 3: Invalid JSON
    response3 = "Here is the JSON: {1: 'Bad Format'}"
    result3 = mock_extract_toc_logic(response3)
    print(f"Test 3 (Invalid): {result3}")
    assert result3 == {}

    print("All tests passed!")

if __name__ == "__main__":
    test_parsing()
