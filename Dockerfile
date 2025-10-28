# Dockerfile for E2EE Messenger Bot
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV DOCKER_CONTAINER=true
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    gnupg2 \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Chrome using correct method
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable

# Install specific ChromeDriver version (more stable)
RUN wget -q https://chromedriver.storage.googleapis.com/114.0.5735.90/chromedriver_linux64.zip \
    && unzip -q chromedriver_linux64.zip \
    && mv chromedriver /usr/local/bin/ \
    && chmod +x /usr/local/bin/chromedriver \
    && rm chromedriver_linux64.zip

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY e2ee_bot.py .

# Create data directory
RUN mkdir -p /app/data

# Start the bot
CMD ["python", "e2ee_bot.py"]
