# Members API

Manage contacts in PoliCRM.

## List Members

```http
GET /members
```

### Parameters

| Parameter      | Type     | Description                                                    |
| -------------- | -------- | -------------------------------------------------------------- |
| `search`       | string   | Search by name or email                                        |
| `status`       | string[] | Filter by status (Verified, Unchecked, Partial, Fail, Captcha) |
| `state`        | string   | Filter by state (NSW, VIC, QLD, etc.)                          |
| `tags`         | number[] | Filter by tag IDs                                              |
| `tag_operator` | string   | `AND` or `OR` for tag matching                                 |
| `skip`         | number   | Pagination offset (default: 0)                                 |
| `limit`        | number   | Page size (default: 50)                                        |
| `sort_by`      | string   | Sort field                                                     |
| `sort_order`   | string   | `asc` or `desc`                                                |

### Response

```json
{
  "members": [...],
  "total": 1234,
  "skip": 0,
  "limit": 50
}
```

## Get Member

```http
GET /members/{id}
```

## Create Member

```http
POST /members
Content-Type: application/json

{
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "jane@example.com",
  "mobile": "0412345678",
  "primary_address": "123 Main St",
  "primary_city": "Melbourne",
  "primary_state": "VIC",
  "primary_zip": "3000"
}
```

## Update Member

```http
PUT /members/{id}
Content-Type: application/json

{
  "email": "newemail@example.com"
}
```

## Delete Member

```http
DELETE /members/{id}
```

## Check AEC (Bulk)

Queue members for AEC verification:

```http
POST /members/check-selected
Content-Type: application/json

{
  "member_ids": [1, 2, 3]
}
```

## Resign Member

Mark member as resigned:

```http
POST /members/{id}/resign
```

## Export CSV

```http
GET /members/export?status=Verified&state=VIC
```

Returns CSV file download.
