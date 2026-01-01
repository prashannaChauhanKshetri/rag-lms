
import sys
import os

# Add project root to path
sys.path.append(os.getcwd())

try:
    from utils_auth import create_access_token, decode_access_token, get_password_hash, verify_password
    from datetime import timedelta
    import time

    def test_password_hashing():
        print("\n--- Testing Password Hashing ---")
        password = "secure_password_123"
        hashed = get_password_hash(password)
        print(f"Password: {password}")
        print(f"Hash: {hashed}")
        
        verify_true = verify_password(password, hashed)
        print(f"Verification (Right Password): {'PASS' if verify_true else 'FAIL'}")
        
        verify_false = verify_password("wrong_password", hashed)
        print(f"Verification (Wrong Password): {'PASS' if not verify_false else 'FAIL'}")

    def test_jwt_flow():
        print("\n--- Testing JWT Flow ---")
        data = {"sub": "user_123", "role": "admin"}
        
        # 1. Create Token
        token = create_access_token(data)
        print(f"Generated Token: {token[:20]}...")
        
        # 2. Decode Token
        decoded = decode_access_token(token)
        print(f"Decoded Data: {decoded}")
        
        if decoded['sub'] == "user_123" and decoded['role'] == "admin":
            print("JWT Verification: PASS")
        else:
            print("JWT Verification: FAIL")

        # 3. Test Expiration (short token)
        short_token = create_access_token(data, expires_delta=timedelta(seconds=1))
        time.sleep(2)
        decoded_expired = decode_access_token(short_token)
        if decoded_expired is None:
            print("JWT Expiration Check: PASS")
        else:
            print("JWT Expiration Check: FAIL")

    if __name__ == "__main__":
        test_password_hashing()
        test_jwt_flow()
except ImportError as e:
    print(f"Import Error: {e}. Make sure requirements are installed.")
except Exception as e:
    print(f"An error occurred: {e}")
