import ollama
from PIL import Image, ImageDraw, ImageFont
import io

def create_test_image():
    """Create a simple image with text"""
    img = Image.new('RGB', (400, 100), color='white')
    d = ImageDraw.Draw(img)
    # Use default font
    d.text((10, 10), "Qwen3-VL OCR Test Successful", fill='black')
    
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    return img_byte_arr.getvalue()

def test_ocr():
    print("Generating test image...")
    img_data = create_test_image()
    
    print("Sending to Qwen3-VL-4B...")
    try:
        response = ollama.chat(
            model='qwen3-vl:4b',
            messages=[{
                'role': 'user',
                'content': 'Read the text in this image. Output ONLY the text.',
                'images': [img_data]
            }]
        )
        text = response['message']['content']
        print(f"\nResult:\n{text}")
        
        if "Test Successful" in text:
            print("\n✅ OCR VERIFIED!")
        else:
            print("\n⚠️ OCR Result unclear.")
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("Make sure Ollama is running and 'qwen3-vl:4b' is pulled.")

if __name__ == "__main__":
    test_ocr()
