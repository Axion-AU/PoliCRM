#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to kill background processes on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down PoliCRM...${NC}"
    kill $(jobs -p) 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

echo -e "${BLUE}Starting PoliCRM...${NC}"

# Check for virtual environment
if [ -d ".venv" ]; then
    echo -e "${GREEN}Activating virtual environment...${NC}"
    source .venv/bin/activate
else
    echo "Warning: No .venv directory found. Running with system Python."
fi

# Check if uvicorn is installed
if ! command -v uvicorn &> /dev/null; then
    echo "Installing dependencies..."
    pip install -r requirements.txt
fi

# Start PostgreSQL container if Docker is available
if command -v docker &> /dev/null; then
    echo -e "${BLUE}Starting PostgreSQL container...${NC}"
    docker compose up -d postgres || docker-compose up -d postgres
    
    # Wait for PostgreSQL to be ready
    echo -e "${YELLOW}Waiting for PostgreSQL...${NC}"
    
    # Wait loop for port 5432
    max_retries=30
    count=0
    while ! nc -z 127.0.0.1 5432; do
        sleep 1
        count=$((count+1))
        if [ $count -ge $max_retries ]; then
            echo -e "${RED}Error: PostgreSQL failed to become ready on 127.0.0.1:5432${NC}"
            # Fallback handling or exit could go here, but script continues to SQLite check logic implicitly 
            # if we don't set DATABASE_URL correctly. However, below we set it unconditionally if logic flow reaches here.
            # Let's just break and let the user see the error if it fails.
            break
        fi
        echo -n "."
    done
    echo ""
    
    # Set DATABASE_URL for PostgreSQL - Force IPv4
    export DATABASE_URL="postgresql://policrm:policrm_dev_2024@127.0.0.1:5432/policrm"
    echo -e "${GREEN}Using PostgreSQL database${NC}"
else
    echo -e "${YELLOW}Docker not found, using SQLite database${NC}"
fi

# Build Frontend (Vite)
echo -e "${BLUE}Building Frontend (Vite)...${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    npm install
fi
npm run build
cd ..

# Print access info
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}   PoliCRM Dashboard: http://localhost:8000${NC}"
echo -e "${GREEN}   API Docs:          http://localhost:8000/docs${NC}"
echo -e "${GREEN}==================================================${NC}"

# Start Backend (FastAPI)
echo -e "${BLUE}Starting Backend (FastAPI)...${NC}"
uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
