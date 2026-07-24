# Configuration Guide

## Environment Variables

### Required

| Variable              | Description                  | Example                                    |
| --------------------- | ---------------------------- | ------------------------------------------ |
| `DATABASE_URL`        | PostgreSQL connection string | `postgresql://user:pass@localhost/policrm` |
| `FIREBASE_PROJECT_ID` | Firebase project ID for auth | `my-project-123`                           |

### Optional

| Variable                | Description         | Default       |
| ----------------------- | ------------------- | ------------- |
| `LOG_LEVEL`             | Logging level       | `INFO`        |
| `WORKERS`               | AEC worker count    | `1`           |
| `AEC_RATE_LIMIT_HOURLY` | Checks per hour     | `100`         |
| `AEC_RATE_LIMIT_DAILY`  | Checks per day      | `2000`        |
| `GECKODRIVER_PATH`      | Firefox driver path | Auto-detected |

## Firebase Setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Authentication with Google and Email/Password providers
3. Generate a service account key (Settings > Service Accounts)
4. Place the JSON key file at `firebase-admin-key.json`

## Database Configuration

### PostgreSQL Recommended Settings

For production workloads with ERA data:

```sql
-- Increase work_mem for complex queries
ALTER SYSTEM SET work_mem = '256MB';

-- Enable parallel queries
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;

-- Reload config
SELECT pg_reload_conf();
```

## Frontend Configuration

The frontend is configured via `frontend/vite.config.ts`:

```typescript
server: {
  port: 5173,
  proxy: {
    "/api": {
      target: "http://localhost:8000",
      rewrite: (path) => path.replace(/^\/api/, ""),
    },
  },
}
```

## Rate Limiting

AEC verification is rate-limited to avoid overloading the electoral commission servers:

- **Hourly limit**: 100 checks (configurable)
- **Daily limit**: 2000 checks (configurable)
- Automatic retry with exponential backoff
