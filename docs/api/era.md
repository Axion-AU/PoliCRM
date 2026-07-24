# ERA (Electoral Roll Access) API

Search and match against electoral roll data.

## Get ERA Stats

```http
GET /era/stats
```

### Response

```json
{
  "total_records": 500000,
  "total_uploads": 3,
  "by_state": { "VIC": 250000, "NSW": 200000 },
  "top_divisions": [{ "division": "Melbourne", "count": 50000 }],
  "total_matches": 1200,
  "verified_matches": 950
}
```

## Search ERA

Fuzzy search against electoral roll:

```http
POST /era/search
Content-Type: application/json

{
  "surname": "Smith",
  "given_names": "John",
  "locality": "Richmond",
  "postcode": "3121",
  "threshold": 80,
  "limit": 20
}
```

### Parameters

| Field         | Required | Description                               |
| ------------- | -------- | ----------------------------------------- |
| `surname`     | Yes      | Surname to search                         |
| `given_names` | No       | Given names (partial match)               |
| `locality`    | No       | Suburb/city filter                        |
| `postcode`    | No       | Postcode filter                           |
| `threshold`   | No       | Fuzzy match threshold (0-100, default 80) |
| `limit`       | No       | Max results (default 20)                  |

## Match Member

Match a CRM member against ERA records:

```http
POST /era/match-member/{memberId}?threshold=80
```

Returns best matching ERA records.

## Batch Match

Match multiple members at once:

```http
POST /era/batch-match
Content-Type: application/json

{
  "member_ids": [1, 2, 3, 4, 5],
  "threshold": 80
}
```

## Get Household

Find other people at the same address:

```http
GET /era/household/{memberId}
```

### Response

```json
{
  "address": "123 Main St",
  "locality": "Richmond",
  "postcode": "3121",
  "federal_division": "Melbourne",
  "members": [
    {
      "era_record_id": 12345,
      "given_names": "Jane",
      "surname": "Smith",
      "is_existing_member": false
    }
  ],
  "total_at_address": 3
}
```

## Upload ERA File

```http
POST /era/upload
Content-Type: multipart/form-data

file: <ERA CSV file>
```

## Browse ERA Records

```http
GET /era/browse?federal_division=Melbourne&limit=50
```

## Get Divisions

```http
GET /era/divisions
```

## Get Localities

```http
GET /era/localities?federal_division=Melbourne
```
