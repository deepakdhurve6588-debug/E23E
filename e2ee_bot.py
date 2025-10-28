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
        print("🖥️  ब्राउज़र शुरू कर रहा हूं...")
        
        options = Options()
        
        # Docker compatible settings
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-extensions")
        
        # Anti-detection
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        # User agent
        options.add_argument("--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")
        
        try:
            self.driver = webdriver.Chrome(options=options)
            self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            print("✅ ब्राउज़र तैयार")
            return True
        except Exception as e:
            print(f"❌ ब्राउज़र एरर: {e}")
            return False
    
    def load_cookies(self):
        """कुकीज लोड करें"""
        try:
            print("🍪 कुकीज लोड हो रही हैं...")
            self.driver.get("https://facebook.com")
            time.sleep(5)
            
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
                # Refresh to apply cookies
                self.driver.refresh()
                time.sleep(3)
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
            if not tid or tid == "100000000000000":
                print("❌ Invalid Thread ID")
                return False
            
            thread_url = f"https://www.facebook.com/messages/e2ee/t/{tid}"
            print(f"🔗 Opening E2EE chat: {thread_url}")
            self.driver.get(thread_url)
            time.sleep(8)
            
            # Wait for page to load
            WebDriverWait(self.driver, 20).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            
            # Try multiple selectors for message box
            selectors = [
                "div[role='textbox']",
                "div[contenteditable='true']",
                "[aria-label*='Message']",
                "[data-editor*='true']"
            ]
            
            message_box = None
            for selector in selectors:
                try:
                    message_box = WebDriverWait(self.driver, 15).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                    )
                    print(f"✅ Found message box with: {selector}")
                    break
                except:
                    continue
            
            if not message_box:
                print("❌ मैसेज बॉक्स नहीं मिला")
                return False
            
            # Clear and send message
            message_box.clear()
            message_box.send_keys(message)
            time.sleep(2)
            
            # Try multiple selectors for send button
            send_selectors = [
                "div[aria-label='Send'][role='button']",
                "[aria-label*='Send']",
                "button[type='submit']",
                "[data-testid*='send']"
            ]
            
            send_btn = None
            for selector in send_selectors:
                try:
                    send_btn = WebDriverWait(self.driver, 15).until(
                        EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
                    )
                    print(f"✅ Found send button with: {selector}")
                    break
                except:
                    continue
            
            if not send_btn:
                print("❌ सेंड बटन नहीं मिला")
                return False
            
            send_btn.click()
            time.sleep(3)
            
            self.messages_sent += 1
            print(f"✅ [{self.messages_sent}] E2EE मैसेज भेजा: {message}")
            return True
            
        except Exception as e:
            print(f"❌ मैसेज एरर: {e}")
            return False
    
    def check_files(self):
        """जरूरी फाइल्स चेक करें"""
        required_files = {
            'cookies.txt': 'Facebook cookies',
            'tid.txt': 'Thread ID',
            'messages.txt': 'Messages list'
        }
        
        missing_files = []
        for file, description in required_files.items():
            if not os.path.exists(f"data/{file}"):
                missing_files.append(f"{file} ({description})")
        
        if missing_files:
            print("❌ ये फाइल्स नहीं मिलीं:")
            for file in missing_files:
                print(f"   - {file}")
            print("\n💡 पहले setup.sh चलाएं या data/ folder में फाइल्स बनाएं")
            return False
        
        # Check if tid is set
        tid = self.read_file("tid.txt")
        if not tid or tid == "100000000000000":
            print("❌ data/tid.txt में अपना thread ID सेट करें")
            return False
            
        return True
    
    def start(self):
        """बॉट शुरू करें"""
        print("🚀 E2EE Messenger Bot Starting...")
        
        # फाइल्स चेक करें
        if not self.check_files():
            return
        
        # ब्राउज़र सेटअप
        if not self.setup_browser():
            print("❌ ब्राउज़र सेटअप फेल")
            return
        
        # कुकीज लोड करें
        if not self.load_cookies():
            print("❌ कुकीज लोड नहीं हो पाईं")
            return
        
        # कॉन्फ़िग लोड करें
        tid = self.read_file("tid.txt")
        delay = int(self.read_file("time.txt", "10"))
        prefix = self.read_file("prefix.txt", "🤖 ")
        
        # मैसेजेस लोड करें
        messages = []
        try:
            with open('data/messages.txt', 'r', encoding='utf-8') as f:
                messages = [line.strip() for line in f if line.strip()]
        except:
            messages = ["Hello from E2EE Bot!"]
        
        if not messages:
            messages = ["Hello from E2EE Bot!"]
        
        print(f"""
🔍 BOT CONFIGURATION:
📱 Thread ID: {tid}
⏰ Delay: {delay} seconds  
📨 Messages: {len(messages)}
🔤 Prefix: {prefix}
🔒 Mode: E2EE Encrypted
🐳 Docker: Running
        """)
        
        print("🔄 Infinite messaging started...")
        print("🛑 Stop with: CTRL+C or 'docker stop e2ee-messenger-bot'\n")
        
        # मैसेज लूप
        message_index = 0
        error_count = 0
        max_errors = 5
        
        try:
            while True:
                if error_count >= max_errors:
                    print("❌ Too many errors, stopping bot")
                    break
                    
                current_message = messages[message_index]
                full_message = f"{prefix}{current_message}".strip()
                
                if self.send_e2ee_message(full_message):
                    message_index = (message_index + 1) % len(messages)
                    error_count = 0  # Reset error count on success
                    print(f"⏳ Waiting {delay} seconds...")
                    time.sleep(delay)
                else:
                    error_count += 1
                    print(f"🔄 Retrying in 10 seconds... (Errors: {error_count}/{max_errors})")
                    time.sleep(10)
                    
        except KeyboardInterrupt:
            print(f"\n🛑 Bot stopped by user. Total messages sent: {self.messages_sent}")
        
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
        
        finally:
            if self.driver:
                self.driver.quit()
                print("🧹 Browser closed")

def create_default_files():
    """डिफॉल्ट फाइल्स बनाएं"""
    os.makedirs("data", exist_ok=True)
    
    files = {
        "tid.txt": "100000000000000",
        "time.txt": "10", 
        "prefix.txt": "🤖 ",
        "messages.txt": "Hello from E2EE Bot!\nThis is automated message\nTesting E2EE encryption",
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
    print("🔒 E2EE MESSENGER BOT - DOCKER VERSION")
    print("=" * 50)
    
    # Check if data directory exists, if not create default files
    if not os.path.exists("data"):
        print("📁 Data directory not found, creating default files...")
        create_default_files()
        print("\n💡 Please edit the files in data/ folder and run again")
        sys.exit(0)
    
    # Start the bot
    bot = E2EEMessenger()
    bot.start()
