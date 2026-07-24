# Tags API

Manage tags for organizing contacts.

## List Tags

```http
GET /tags
```

### Response

```json
[
  {
    "id": 1,
    "name": "Volunteer",
    "color": "#22c55e",
    "description": "Active volunteers",
    "created_at": "2024-01-15T10:30:00Z"
  }
]
```

## Create Tag

```http
POST /tags
Content-Type: application/json

{
  "name": "Donor",
  "color": "#3b82f6",
  "description": "Financial contributors"
}
```

## Update Tag

```http
PUT /tags/{id}
Content-Type: application/json

{
  "name": "Major Donor",
  "color": "#8b5cf6"
}
```

## Delete Tag

```http
DELETE /tags/{id}
```

## Add Tag to Member

```http
POST /members/{memberId}/tags
Content-Type: application/json

{
  "tag_id": 1
}
```

## Remove Tag from Member

```http
DELETE /members/{memberId}/tags/{tagId}
```

## Tag Colors

Recommended color palette:

| Use Case | Color                               |
| -------- | ----------------------------------- |
| Green    | `#22c55e` - Active/Positive         |
| Blue     | `#3b82f6` - Info/Default            |
| Purple   | `#8b5cf6` - Premium/VIP             |
| Orange   | `#f97316` - Warning/Needs Attention |
| Red      | `#ef4444` - Critical/Urgent         |
| Cyan     | `#06b6d4` - Communication           |
