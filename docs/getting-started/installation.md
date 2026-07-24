# Installation Guide

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- **PostgreSQL** 14+
- **Firefox** + Geckodriver (for AEC verification)

## Clone Repository

```bash
git clone https://github.com/your-org/policrm.git
cd policrm
```

## Backend Setup

### 1. Create Virtual Environment

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Database Setup

```bash
# Create PostgreSQL database
createdb policrm

# Or using psql
psql -c "CREATE DATABASE policrm;"
```

### 4. Environment Variables

Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL=postgresql://localhost/policrm

# Firebase (for auth)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_API_KEY=your-api-key

# Optional
LOG_LEVEL=INFO
WORKERS=2
```

## Frontend Setup

```bash
cd frontend
npm install
```

## Running Locally

### Option 1: Development Script

```bash
./run_crm.sh
```

This starts both backend (port 8000) and frontend (port 5173).

### Option 2: Manual Start

Terminal 1 - Backend:

```bash
source venv/bin/activate
uvicorn src.api.main:app --reload --port 8000
```

Terminal 2 - Frontend:

```bash
cd frontend
npm run dev
```

## Verify Installation

1. Open http://localhost:5173
2. You should see the login page
3. Sign in with Google or email/password
4. Navigate to People page to verify data loads

## Next Steps

- [Configuration](./configuration.md) - Customize settings
- [Quick Start](./quick-start.md) - First tasks tutorial
