# API Overview

PoliCRM exposes a RESTful API built with FastAPI.

## Base URL

- **Development**: `http://localhost:8000`
- **Production**: `https://your-domain.com/api`

## Authentication

All API endpoints require a Firebase JWT token in the `Authorization` header:

```http
Authorization: Bearer <firebase-id-token>
```

Get a token by signing in via the frontend, or directly via Firebase SDK.

## Response Format

All responses return JSON. Success responses include the data directly:

```json
{
  "id": 1,
  "first_name": "John",
  "last_name": "Doe"
}
```

Error responses follow this format:

```json
{
  "detail": "Error message here"
}
```

## API Sections

| Endpoint Prefix | Description             |
| --------------- | ----------------------- |
| `/members`      | Contact management      |
| `/tags`         | Tag CRUD and assignment |
| `/stats`        | Dashboard statistics    |
| `/analytics`    | Growth and trends       |
| `/era`          | Electoral roll access   |
| `/system`       | Queue status            |
| `/db`           | Database viewer (admin) |

## Common Parameters

### Pagination

```
?skip=0&limit=50
```

### Sorting

```
?sort_by=created_at&sort_order=desc
```

### Filtering

```
?status=Verified&status=Partial&state=VIC
```

## Rate Limits

- Standard endpoints: 1000 requests/minute
- ERA search: 100 requests/hour
- AEC verification: Configurable via env vars

## Next: Detailed Endpoints

- [Members API](./members.md)
- [Tags API](./tags.md)
- [Stats API](./stats.md)
- [ERA API](./era.md)
