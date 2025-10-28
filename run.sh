#!/bin/bash

echo "🔒 E2EE Messenger Bot - Docker Runner"
echo "====================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if data files exist
if [ ! -f "data/cookies.txt" ]; then
    echo "❌ data/cookies.txt not found!"
    echo "💡 Running setup script..."
    chmod +x setup.sh
    ./setup.sh
    echo "⚠️  Please edit data/cookies.txt and data/tid.txt first"
    exit 1
fi

# Check if cookies are set
if grep -q "PASTE_YOUR" data/cookies.txt; then
    echo "❌ Please edit data/cookies.txt with your Facebook cookies"
    exit 1
fi

# Check if thread ID is set
if grep -q "100000000000000" data/tid.txt; then
    echo "❌ Please edit data/tid.txt with your thread ID"
    exit 1
fi

echo "🚀 Starting Docker container..."
docker-compose up --build
