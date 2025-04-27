#!/bin/bash

# Build the Docker image
docker build -t bet-bot .

# Check if data directory exists
if [ ! -d "$(pwd)/data" ]; then
  echo "Error: data directory not found!"
  echo "Please ensure your database is in the data/ directory"
  exit 1
fi

# Print database info
echo "Local database files:"
ls -la $(pwd)/data

# Run the container with proper volume mounting
docker run -v $(pwd)/data:/app/data bet-bot

# Usage instructions:
# 1. Make this script executable: chmod +x docker-run.sh
# 2. Run it: ./docker-run.sh 