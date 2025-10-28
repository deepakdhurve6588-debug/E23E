#!/bin/bash

echo "🐳 E2EE Messenger Bot Setup"
echo "==========================="

# Create directory structure
mkdir -p data

echo "📁 Creating default files..."

# Create default files
cat > data/tid.txt << 'EOL'
100000000000000
EOL

cat > data/time.txt << 'EOL'
10
EOL

cat > data/prefix.txt << 'EOL'
🤖 
EOL

cat > data/messages.txt << 'EOL'
Hello from E2EE Bot!
This is automated message
Testing E2EE encryption
Message sent via Docker
EOL

cat > data/cookies.txt << 'EOL'
# Facebook Cookies - Paste your cookies here
# Format: domain<TAB>TRUE<TAB>path<TAB>secure<TAB>expiration<TAB>name<TAB>value
.facebook.com	TRUE	/	TRUE	1735689999	xs	PASTE_YOUR_XS_COOKIE_HERE
.facebook.com	TRUE	/	TRUE	1735689999	c_user	PASTE_YOUR_USER_ID_HERE
.facebook.com	TRUE	/	TRUE	1735689999	fr	PASTE_YOUR_FR_COOKIE_HERE
EOL

cat > requirements.txt << 'EOL'
selenium==4.15.0
EOL

cat > docker-compose.yml << 'EOL'
version: '3.8'

services:
  e2ee-messenger-bot:
    build: .
    container_name: e2ee-messenger-bot
    restart: unless-stopped
    volumes:
      - ./data:/app/data:rw
    environment:
      - DOCKER_CONTAINER=true
      - PYTHONUNBUFFERED=1
    stdin_open: true
    tty: true
EOL

echo "✅ All files created!"
echo ""
echo "🚀 NEXT STEPS:"
echo "1. Edit data/cookies.txt with your Facebook cookies"
echo "2. Edit data/tid.txt with your thread ID"
echo "3. Run: docker-compose up --build"
echo ""
echo "📝 To get Facebook cookies:"
echo "   - Open Chrome DevTools (F12)"
echo "   - Go to Application tab → Cookies → https://facebook.com"
echo "   - Copy xs, c_user, and fr cookies"
echo ""
