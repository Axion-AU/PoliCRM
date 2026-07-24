# PoliCRM Developer Documentation

Welcome to the PoliCRM developer documentation. This guide covers everything you need to set up, develop, and deploy the application.

## Quick Links

- [Getting Started](./getting-started/installation.md)
- [API Reference](./api/overview.md)
- [Frontend Guide](./frontend/architecture.md)
- [Backend Guide](./backend/architecture.md)
- [Deployment](./deployment/docker.md)

## Overview

PoliCRM is a modern CRM designed for Australian political parties. It provides:

- **Member Management** - Track contacts, tags, and engagement
- **AEC Verification** - Automated electoral roll verification
- **Electoral Roll Access (ERA)** - Search and match against electoral data
- **Campaign Tools** - Analytics, reporting, and targeting

## Tech Stack

| Layer    | Technology                        |
| -------- | --------------------------------- |
| Frontend | React, Vite, TailwindCSS          |
| Backend  | Python, FastAPI, SQLAlchemy       |
| Database | PostgreSQL                        |
| Auth     | Firebase Authentication           |
| Workers  | Background processing with queues |

## Project Structure

```
PoliCRM/
├── frontend/               # React SPA
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API client
│   │   ├── stores/        # Nanostores state
│   │   └── utils/         # Utilities
│   └── vite.config.ts     # Vite configuration
├── src/
│   ├── api/               # FastAPI backend
│   │   ├── main.py        # App entry point
│   │   ├── routers/       # API route handlers
│   │   ├── services/      # Business logic
│   │   └── models/        # SQLAlchemy models
│   └── aec_worker/        # AEC verification worker
├── docs/                   # This documentation
└── run_crm.sh             # Development startup script
```

## Getting Help

- Check the [Troubleshooting](./getting-started/troubleshooting.md) guide
- Review the API error responses
- Check console/server logs
