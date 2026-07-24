#!/bin/bash

# Ensure we are in the project root
cd "$(dirname "$0")"

# Check if .venv exists
if [ -d ".venv" ]; then
    echo "Activating virtual environment..."
    source .venv/bin/activate
else
    echo "Virtual environment not found at .venv"
    echo "Please ensure you have set up the project correctly."
    exit 1
fi

# Safety check
echo "IMPORTANT: Please ensure the 'run_crm.sh' server is STOPPED to avoid database locks."
echo "If it is running, press Ctrl+C in that terminal now."
read -p "Press Enter to continue when the server is stopped..."

# Install dependencies if needed (quietly)
echo "Checking dependencies..."
pip install python-dotenv psycopg2-binary sqlalchemy > /dev/null 2>&1

# Run the reset script
echo "Running reset script..."
python3 reset_era_db.py
