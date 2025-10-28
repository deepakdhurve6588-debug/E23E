# -*- coding: utf-8 -*-
import time
import random
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
        self.config = self.load_config()
    
    def load_config(self):
        """सभी कॉन्फ़िग लोड करें"""
        return {
            "thread_id": self.read_file("tid.txt", "100000000000000"),
            "delay_time": self.read_file("time.txt", "3"),
            "cookie_file": "cookies.txt",
            "prefix_file": "prefix.txt", 
            "messages_file": "messages.txt"
        }
    
    def read_file(self, filename, default=""):
        """फाइल पढ़ें"""
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                return f.read().strip()
        except:
            return default
    
    def write_file(self, filename, content):
        """फाइल लिखें"""
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(content)
    
    def setup_browser(self):
        """ब्राउज़र सेटअप करें"""
        print("🖥️  ब्राउज़र शुरू कर रहा हूं...")
        options = Options()
        
        # Docker/Render के लिए सेटिंग्स
        if os.environ.get('DOCKER_CONTAINER') or os.environ.get('RENDER'):
            options.add_argument("--headless=new")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-gpu")
        
        options.add_argument("--window-size=1920,1080")
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
            with open(self.config['cookie_file'], 'r') as f:
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
            # E2EE थ्रेड URL
            thread_url = f"https://www.facebook.com/messages/e2ee/t/{self.config['thread_id']}"
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
    
    def start_messaging(self):
        """मैसेजिंग शुरू करें"""
        print("🚀 E2EE मैसेजिंग शुरू हो रही है...")
        
        # ब्राउज़र सेटअप
        self.setup_browser()
        
        # कुकीज लोड करें
        if not self.load_cookies():
            print("❌ कुकीज लोड नहीं हो पाईं")
            if not os.path.exists(self.config['cookie_file']):
                print("👉 पहले cookies.txt फाइल बनाएं")
            return
        
        # कॉन्फ़िग चेक करें
        tid = self.config['thread_id']
        if not tid or tid == "100000000000000":
            print("❌ thread ID सेट नहीं है!")
            print("👉 tid.txt में अपना Facebook thread ID डालें")
            return
        
        # डेटा लोड करें
        delay = int(self.config['delay_time'])
        prefix = self.read_file("prefix.txt", "🤖 ")
        
        # मैसेजेस लोड करें
        messages = []
        try:
            with open(self.config['messages_file'], 'r', encoding='utf-8') as f:
                messages = [line.strip() for line in f if line.strip()]
        except:
            messages = ["Hello from E2EE Bot!"]
        
        if not messages:
            messages = ["Hello from E2EE Bot!"]
        
        print(f"""
🔍 कॉन्फ़िग सारांश:
📱 Thread ID: {tid}
⏰ Delay Time: {delay} सेकंड
📨 Messages: {len(messages)}
🔤 Prefix: {prefix}
🔒 Mode: E2EE Encrypted
        """)
        
        print("🚀 मैसेजिंग शुरू... (CTRL+C to stop)\n")
        
        message_index = 0
        try:
            while True:  # अनंत लूप
                current_message = messages[message_index]
                full_message = f"{prefix}{current_message}".strip()
                
                if self.send_e2ee_message(full_message):
                    message_index = (message_index + 1) % len(messages)
                    time.sleep(delay)
                else:
                    print("🔄 रिट्रायिंग...")
                    time.sleep(10)
        
        except KeyboardInterrupt:
            print(f"\n🛑 रोका गया! कुल {self.messages_sent} मैसेज भेजे गए")
        
        finally:
            if self.driver:
                self.driver.quit()
                print("🧹 ब्राउज़र बंद हो गया")

def create_default_files():
    """डिफॉल्ट फाइल्स बनाएं"""
    files = {
        "tid.txt": "100000000000000",
        "time.txt": "3", 
        "prefix.txt": "🤖 ",
        "messages.txt": "नमस्ते! यह E2EE encrypted message है\nकैसे हो?\nयह ऑटोमेटेड मैसेज है",
        "cookies.txt": """# Facebook Cookies - यहाँ अपनी कुकीज पेस्ट करें
# Format: domain<TAB>TRUE<TAB>path<TAB>secure<TAB>expiration<TAB>name<TAB>value
.facebook.com	TRUE	/	TRUE	1735689999	xs	PASTE_YOUR_XS_COOKIE_HERE
.facebook.com	TRUE	/	TRUE	1735689999	c_user	PASTE_YOUR_USER_ID_HERE
.facebook.com	TRUE	/	TRUE	1735689999	fr	PASTE_YOUR_FR_COOKIE_HERE
"""
    }
    
    for filename, content in files.items():
        if not os.path.exists(filename):
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✅ {filename} बन गई")
    
    print("\n🎉 सभी फाइल्स तैयार हैं!")
    print("👉 अब इन फाइल्स को एडिट करें:")
    print("   - cookies.txt: अपनी Facebook कुकीज पेस्ट करें")
    print("   - tid.txt: अपना thread ID डालें")

def show_status():
    """करंट स्टेटस दिखाएं"""
    files = {
        "Thread ID": "tid.txt",
        "Delay Time": "time.txt",
        "Prefix": "prefix.txt", 
        "Messages": "messages.txt",
        "Cookies": "cookies.txt"
    }
    
    print("\n📊 CURRENT CONFIGURATION:")
    print("=" * 40)
    
    for name, filename in files.items():
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if name == "Messages":
                    lines = content.split('\n')
                    print(f"{name}: {len(lines)} messages")
                elif name == "Cookies":
                    print(f"{name}: {'SET' if content and 'PASTE' not in content else 'NOT SET'}")
                else:
                    print(f"{name}: {content}")
        except:
            print(f"{name}: ❌ FILE NOT FOUND")

def update_config():
    """कॉन्फ़िग अपडेट करें"""
    print("\n⚙️  कॉन्फ़िग अपडेट")
    print("1. Thread ID बदलें")
    print("2. Delay Time बदलें") 
    print("3. Prefix बदलें")
    print("4. Messages एडिट करें")
    print("5. वापस मेनू")
    
    choice = input("👉 चुनाव करें: ")
    
    if choice == '1':
        new_tid = input("नया Thread ID: ")
        with open("tid.txt", "w") as f:
            f.write(new_tid)
        print("✅ Thread ID अपडेट हो गया")
    
    elif choice == '2':
        new_delay = input("नया Delay Time (सेकंड में): ")
        with open("time.txt", "w") as f:
            f.write(new_delay)
        print("✅ Delay Time अपडेट हो गया")
    
    elif choice == '3':
        new_prefix = input("नया Prefix: ")
        with open("prefix.txt", "w", encoding="utf-8") as f:
            f.write(new_prefix)
        print("✅ Prefix अपडेट हो गया")
    
    elif choice == '4':
        print("\n📝 Messages एडिटर")
        print("वर्तमान मैसेजेस:")
        try:
            with open("messages.txt", "r", encoding="utf-8") as f:
                print(f.read())
        except:
            pass
        
        print("\n1. नया मैसेज ऐड करें")
        print("2. सभी मैसेजेस रीसेट करें")
        print("3. वापस")
        
        sub_choice = input("👉 चुनाव करें: ")
        
        if sub_choice == '1':
            new_msg = input("नया मैसेज: ")
            with open("messages.txt", "a", encoding="utf-8") as f:
                f.write(f"\n{new_msg}")
            print("✅ मैसेज ऐड हो गया")
        
        elif sub_choice == '2':
            confirm = input("सभी मैसेजेस डिलीट करें? (y/n): ")
            if confirm.lower() == 'y':
                with open("messages.txt", "w", encoding="utf-8") as f:
                    f.write("नमस्ते! यह E2EE encrypted message है\nकैसे हो?\nयह ऑटोमेटेड मैसेज है")
                print("✅ मैसेजेस रीसेट हो गए")

def main_menu():
    """मेन मेनू"""
    while True:
        print("\n" + "="*50)
        print("🔒 E2EE MESSENGER BOT - SINGLE FILE")
        print("="*50)
        print("1. 🚀 बॉट शुरू करें")
        print("2. 📊 स्टेटस देखें")
        print("3. ⚙️  कॉन्फ़िग अपडेट करें")
        print("4. 📁 डिफॉल्ट फाइल्स बनाएं")
        print("5. 🚪 एक्सिट")
        
        choice = input("\n👉 अपना चुनाव डालें (1-5): ")
        
        if choice == '1':
            # बॉट शुरू करें
            bot = E2EEMessenger()
            bot.start_messaging()
        
        elif choice == '2':
            show_status()
        
        elif choice == '3':
            update_config()
        
        elif choice == '4':
            create_default_files()
        
        elif choice == '5':
            print("👋 अलविदा!")
            break
        
        else:
            print("❌ गलत चुनाव! फिर से कोशिश करें")

# Dockerfile content as string
DOCKERFILE = """
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \\
    wget curl unzip gnupg \\
    fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \\
    libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 \\
    libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 \\
    libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \\
    libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 \\
    libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \\
    lsb-release xdg-utils \\
    && rm -rf /var/lib/apt/lists/*

RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \\
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \\
    && apt-get update \\
    && apt-get install -y google-chrome-stable

RUN CHROME_VERSION=$(google-chrome --version | awk '{print $3}') \\
    && CHROMEDRIVER_VERSION=$(echo $CHROME_VERSION | cut -d'.' -f1,2,3) \\
    && wget -q "https://storage.googleapis.com/chrome-for-testing-public/${CHROMEDRIVER_VERSION}/linux64/chromedriver-linux64.zip" \\
    && unzip -q chromedriver-linux64.zip \\
    && mv chromedriver-linux64/chromedriver /usr/local/bin/ \\
    && chmod +x /usr/local/bin/chromedriver \\
    && rm -rf chromedriver-linux64.zip

WORKDIR /app
COPY e2ee_bot.py .
RUN pip install selenium==4.15.0

CMD ["python", "e2ee_bot.py"]
"""

# Docker Compose content
DOCKER_COMPOSE = """
version: '3.8'
services:
  e2ee-bot:
    build: .
    container_name: e2ee-messenger-bot
    restart: unless-stopped
    volumes:
      - ./data:/app/data:rw
    environment:
      - DOCKER_CONTAINER=true
"""

def setup_docker():
    """Docker सेटअप करें"""
    print("🐳 Docker सेटअप...")
    
    # Dockerfile बनाएं
    with open("Dockerfile", "w") as f:
        f.write(DOCKERFILE)
    print("✅ Dockerfile बन गया")
    
    # docker-compose.yml बनाएं  
    with open("docker-compose.yml", "w") as f:
        f.write(DOCKER_COMPOSE)
    print("✅ docker-compose.yml बन गया")
    
    # data directory बनाएं
    os.makedirs("data", exist_ok=True)
    print("✅ data directory बन गया")
    
    print("\n🎉 Docker सेटअप कंप्लीट!")
    print("👉 अब चलाएं: docker-compose up --build")

if __name__ == "__main__":
    # चेक करें कि Docker mode में चल रहा है
    if len(sys.argv) > 1 and sys.argv[1] == "docker-setup":
        setup_docker()
    else:
        main_menu()
