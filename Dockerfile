# ULTRA SIMPLE Dockerfile - Using Selenium Base
FROM selenium/standalone-chrome:latest

# Switch to root to install Python
USER root

# Install Python and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Set Python3 as default
RUN ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application
COPY e2ee_bot.py .

# Create data directory
RUN mkdir -p /app/data

# Switch back to selenium user
USER 1200

CMD ["python3", "e2ee_bot.py"]
