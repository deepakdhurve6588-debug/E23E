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
    
    def setup_browser_docker(self):
        """Docker के लिए ब्राउज़र सेटअप"""
        print("🐳 Docker में ब्राउज़र शुरू कर रहा हूं...")
        
        options = Options()
        
        # Docker optimized settings
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-extensions")
        options.add_argument("--disable-plugins")
        options.add_argument("--disable-images")
        
        # Performance
        options.add_argument("--disable-background-timer-throttling")
        options.add_argument("--disable-renderer-backgrounding")
        options.add_argument("--disable-backgrounding-occluded-windows")
        
        # Anti-detection
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option('useAutomationExtension', False)
        
        # Remote debugging for Docker
        options.add_argument("--remote-debugging-port=9222")
        options.add_argument("--remote-debugging-address=0.0.0.0")
        
        try:
            self.driver = webdriver.Chrome(options=options)
            self.driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            print("✅ ब्राउज़र तैयार - Docker Mode")
            return True
        except Exception as e:
            print(f"❌ ब्राउज़र एरर: {e}")
            return False
    
    def load_cookies(self):
        """कुकीज लोड करें"""
        try:
            print("🍪 कुकीज लोड हो रही हैं...")
            self.driver.get("https://facebook.com")
            time.sleep(5)  # Increased wait time for Docker
            
            # Check if we're on Facebook
            if "facebook" not in self.driver.current_url:
                print("❌ Facebook पर रीडायरेक्ट नहीं हुआ")
                return False
            
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
                            except Exception as cookie_error:
                                print(f"⚠️ Cookie error: {cookie_error}")
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
            print(f"🔗 Opening: {thread_url}")
            self.driver.get(thread_url)
            time.sleep(8)  # Increased wait for Docker
            
            # Wait for page to load
            WebDriverWait(self.driver, 20).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )
            
            # Find message box with multiple selectors
            selectors = [
                "div[role='textbox']",
                "div[contenteditable='true']",
                "[aria-label*='Message']",
                "[data-editor*='true']"
            ]
            
            message_box = None
            for selector in selectors:
                try:
                    message_box = WebDriverWait(self.driver, 10).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                    )
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
            
            # Find send button
            send_selectors = [
                "div[aria-label='Send'][role='button']",
                "[aria-label*='Send']",
                "button[type='submit']"
            ]
            
            send_btn = None
            for selector in send_selectors:
                try:
                    send_btn = WebDriverWait(self.driver, 10).until(
                        EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
                    )
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
    
    def start(self):
        """बॉट शुरू करें"""
        print("🚀 Docker E2EE Bot Starting...")
        
        # Check essential files
        if not os.path.exists('data/cookies.txt'):
            print("❌ data/cookies.txt नहीं मिली!")
            print("👉 data/cookies.txt में अपनी Facebook कुकीज पेस्ट करें")
            return
        
        tid = self.read_file("tid.txt")
        if not tid or tid == "100000000000000":
            print("❌ thread ID सेट नहीं है!")
            print("👉 data/tid.txt में अपना Facebook thread ID डालें")
            return
        
        # Setup browser
        if not self.setup_browser_docker():
            print("❌ ब्राउज़र सेटअप फेल")
            return
        
        # Load cookies
        if not self.load_cookies():
            print("❌ कुकीज लोड नहीं हो पाईं")
            return
        
        # Load config
        delay = int(self.read_file("time.txt", "10"))
        prefix = self.read_file("prefix.txt", "🤖 ")
        
        # Load messages
        messages = []
        try:
            with open('data/messages.txt', 'r', encoding='utf-8') as f:
                messages = [line.strip() for line in f if line.strip()]
        except:
            messages = ["Hello from Docker E2EE Bot!"]
        
        if not messages:
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
        
        # Message loop
        message_index = 0
        error_count = 0
        max_errors = 5
        
        while True:
            if error_count >= max_errors:
                print("❌ Too many errors, stopping bot")
                break
                
            current_message = messages[message_index]
            full_message = f"{prefix}{current_message}".strip()
            
            if self.send_e2ee_message(full_message):
                message_index = (message_index + 1) % len(messages)
                error_count = 0  # Reset error count on success
                time.sleep(delay)
            else:
                error_count += 1
                print(f"🔄 Retrying in 10 seconds... (Errors: {error_count}/{max_errors})")
                time.sleep(10)

def main():
    print("=" * 50)
    print("🐳 DOCKER E2EE MESSENGER BOT - FIXED VERSION")
    print("=" * 50)
    
    # Check if running in Docker
    if not os.environ.get('DOCKER_CONTAINER'):
        print("⚠️  Not running in Docker container")
        print("💡 Run with: docker-compose up --build")
        return
    
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

if __name__ == "__main__":
    main()
