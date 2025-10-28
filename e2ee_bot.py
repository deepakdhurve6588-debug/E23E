# -*- coding: utf-8 -*-
import time
import os
import sys
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

class E2EEMessenger:
    def __init__(self):
        self.driver = None
        self.messages_sent = 0
    
    def read_file(self, filename, default=""):
        """फाइल पढ़ें"""
        try:
            with open(f"data/{filename}", 'r', encoding='utf-8') as f:
                return f.read().strip()
        except:
            return default
    
    def setup_browser(self):
        """ब्राउज़र सेटअप करें"""
        print("🐳 Docker में ब्राउज़र शुरू कर रहा हूं...")
        options = Options()
        
        # Docker के लिए सेटिंग्स
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        
        # Anti-detection
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        self.driver = webdriver.Chrome(options=options)
        self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        print("✅ ब्राउज़र तैयार")
    
    def load_cookies(self):
        """कुकीज लोड करें"""
        try:
            print("🍪 कुकीज लोड हो रही हैं...")
            self.driver.get("https://facebook.com")
            time.sleep(3)
            
            cookies_loaded = False
            with open('data/cookies.txt', 'r') as f:
                for line in f:
                    if not line.startswith('#') and line.strip():
                        parts = line.strip().split('\t')
                        if len(parts) >= 7:
                            cookie = {
                                'domain': parts[0],
                                'name': parts[5],
                                'value': parts[6],
                                'path': parts[2],
                                'secure': parts[3].lower() == 'true'
                            }
                            try:
                                self.driver.add_cookie(cookie)
                                cookies_loaded = True
                            except:
                                continue
            
            if cookies_loaded:
                print("✅ कुकीज लोड हो गईं")
                return True
            else:
                print("❌ कोई कुकीज नहीं मिलीं")
                return False
                
        except Exception as e:
            print(f"❌ कुकीज एरर: {e}")
            return False
    
    def send_e2ee_message(self, message):
        """E2EE मैसेज भेजें"""
        try:
            tid = self.read_file("tid.txt")
            thread_url = f"https://www.facebook.com/messages/e2ee/t/{tid}"
            self.driver.get(thread_url)
            time.sleep(5)
            
            # मैसेज बॉक्स ढूंढें
            message_box = WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div[role='textbox'], div[contenteditable='true']"))
            )
            message_box.clear()
            message_box.send_keys(message)
            
            # सेंड बटन ढूंढें
            send_btn = WebDriverWait(self.driver, 15).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "div[aria-label='Send'][role='button']"))
            )
            send_btn.click()
            
            self.messages_sent += 1
            print(f"✅ [{self.messages_sent}] E2EE मैसेज भेजा: {message}")
            return True
            
        except Exception as e:
            print(f"❌ मैसेज एरर: {e}")
            return False
    
    def start(self):
        """बॉट शुरू करें"""
        print("🚀 Docker E2EE Bot Starting...")
        
        # फाइल्स चेक करें
        if not os.path.exists('data/cookies.txt'):
            print("❌ data/cookies.txt नहीं मिली!")
            print("👉 data/cookies.txt में अपनी Facebook कुकीज पेस्ट करें")
            return
        
        tid = self.read_file("tid.txt")
        if not tid or tid == "100000000000000":
            print("❌ thread ID सेट नहीं है!")
            print("👉 data/tid.txt में अपना Facebook thread ID डालें")
            return
        
        # ब्राउज़र सेटअप
        self.setup_browser()
        
        # कुकीज लोड करें
        if not self.load_cookies():
            return
        
        # कॉन्फ़िग लोड करें
        delay = int(self.read_file("time.txt", "5"))
        prefix = self.read_file("prefix.txt", "🤖 ")
        
        # मैसेजेस लोड करें
        messages = []
        try:
            with open('data/messages.txt', 'r', encoding='utf-8') as f:
                messages = [line.strip() for line in f if line.strip()]
        except:
            messages = ["Hello from Docker E2EE Bot!"]
        
        print(f"""
🔍 DOCKER CONFIG:
📱 Thread ID: {tid}
⏰ Delay: {delay} seconds  
📨 Messages: {len(messages)}
🔤 Prefix: {prefix}
🔒 Mode: E2EE Encrypted
🐳 Container: Running
        """)
        
        print("🔄 Infinite messaging started... (Stop with: docker stop e2ee-messenger-bot)\n")
        
        # मैसेज लूप
        message_index = 0
        while True:
            current_message = messages[message_index]
            full_message = f"{prefix}{current_message}".strip()
            
            if self.send_e2ee_message(full_message):
                message_index = (message_index + 1) % len(messages)
                time.sleep(delay)
            else:
                print("🔄 Retrying in 10 seconds...")
                time.sleep(10)

def create_default_files():
    """डिफॉल्ट फाइल्स बनाएं"""
    os.makedirs("data", exist_ok=True)
    
    files = {
        "tid.txt": "100000000000000",
        "time.txt": "5", 
        "prefix.txt": "🤖 [DOCKER]: ",
        "messages.txt": "Hello from Docker E2EE Bot!\nThis is automated message\nTesting E2EE encryption\nMessage sent via Docker container",
        "cookies.txt": """# Facebook Cookies - Paste your cookies here
# Format: domain<TAB>TRUE<TAB>path<TAB>secure<TAB>expiration<TAB>name<TAB>value
.facebook.com	TRUE	/	TRUE	1735689999	xs	PASTE_YOUR_XS_COOKIE_HERE
.facebook.com	TRUE	/	TRUE	1735689999	c_user	PASTE_YOUR_USER_ID_HERE
.facebook.com	TRUE	/	TRUE	1735689999	fr	PASTE_YOUR_FR_COOKIE_HERE
"""
    }
    
    for filename, content in files.items():
        filepath = f"data/{filename}"
        if not os.path.exists(filepath):
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✅ {filepath} created")
    
    print("\n🎉 Default files created!")
    print("👉 Now edit these files:")
    print("   - data/cookies.txt: Paste your Facebook cookies")
    print("   - data/tid.txt: Set your thread ID")

if __name__ == "__main__":
    print("=" * 50)
    print("🐳 DOCKER E2EE MESSENGER BOT")
    print("=" * 50)
    
    # Check if running in Docker
    if not os.environ.get('DOCKER_CONTAINER'):
        print("⚠️  Not running in Docker container")
        print("💡 Run with: docker-compose up --build")
        
        # Create default files if not exists
        create_default_files()
        sys.exit(0)
    
    # Docker container में running है
    bot = E2EEMessenger()
    
    try:
        bot.start()
    except KeyboardInterrupt:
        print("\n🛑 Bot stopped by user")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if bot.driver:
            bot.driver.quit()
            print("🧹 Browser closed")
