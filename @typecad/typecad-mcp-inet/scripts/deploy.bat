@echo off
REM TypeCAD MCP Server Deployment Script for Windows

echo 🚀 Deploying TypeCAD MCP Server...

REM Build the project
echo 📦 Building project...
call npm run build

REM Check deployment target
if "%1"=="docker" (
    echo 🐳 Building Docker image...
    docker build -t typecad-mcp:latest .
    
    echo 🏃 Running Docker container...
    docker run -d -p 3000:3000 --name typecad-mcp-server typecad-mcp:latest
    
    echo ✅ Docker deployment complete!
    echo 🌐 Server available at: http://localhost:3000
) else if "%1"=="vercel" (
    echo ▲ Deploying to Vercel...
    call vercel --prod
    
    echo ✅ Vercel deployment complete!
) else (
    echo 🏠 Starting local web server...
    call npm run start:web
)