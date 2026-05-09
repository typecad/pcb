#!/bin/bash

# TypeCAD MCP Server Deployment Script

set -e

echo "🚀 Deploying TypeCAD MCP Server..."

# Build the project
echo "📦 Building project..."
npm run build

# Check if we're deploying to Docker
if [ "$1" = "docker" ]; then
    echo "🐳 Building Docker image..."
    docker build -t typecad-mcp:latest .
    
    echo "🏃 Running Docker container..."
    docker run -d -p 3000:3000 --name typecad-mcp-server typecad-mcp:latest
    
    echo "✅ Docker deployment complete!"
    echo "🌐 Server available at: http://localhost:3000"

# Check if we're deploying to Vercel
elif [ "$1" = "vercel" ]; then
    echo "▲ Deploying to Vercel..."
    vercel --prod
    
    echo "✅ Vercel deployment complete!"

# Default: local development
else
    echo "🏠 Starting local web server..."
    npm run start:web
fi