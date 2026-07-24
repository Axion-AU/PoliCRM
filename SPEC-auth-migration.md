# Auth Migration: Firebase → Self-Hosted JWT

## Motivation

Firebase Authentication is being removed because:
1. **External dependency with no offline fallback** — if Firebase goes down or the network is degraded, login breaks entirely
2. **Ongoing cost** — free tier has limits; auth scales non-trivially with user counts
3. **Operational complexity** — managing a Firebase project, service account, and admin SDK is unnecessary overhead for a CRM that runs on its own infrastructure
4. **No benefit from Firebase's features** — we don't need social login, phone auth, MFA, or any Firebase-specific feature. Email/password with JWT is sufficient.

## Architecture

### Auth Flow (proposed)

```
 ┌──────────────┐           POST /auth/login {email, password}            ┌──────────────┐
 │              │ ─────────────────────────────────────────────────────→  │              │
 │   Frontend   │                                                         │   Backend    │
 │   (React)    │  ←────────────────────────────────────────────────────  │  (FastAPI /  │
 │              │    200 {access_token, user{id, name, email, role}}     │   Axum)      │
 └──────┬───────┘                                                        └──────┬───────┘
        │                                                                       │
        │  Store token in memory + httpOnly cookie                             │
        │  Attach `Authorization: Bearer <token>` to all API requests          │
        └──────────────────────────────────────────────────────────────────────┘
```

### Token Strategy

- **Access token**: short-lived JWT (15 min), signed with `SECRET_KEY`
- **Refresh token**: long-lived opaque token (30 days), stored in DB + httpOnly cookie
- **Token rotation**: refresh token is rotated on each use (old one invalidated)

### Why JWT over session-based auth?

Sessions (stored server-side) are simpler but add state to every request. JWT is stateless — the backend validates the signature without a DB lookup on every request. The refresh token still needs DB storage but is only checked on `/auth/refresh`. This is the right tradeoff for an API-heavy CRM.

## User Model

The existing backend `User` model needs a `password_hash` column and `firebase_uid` removed:

```python
class User(Base):
    __tablename__ = "users"

    id: int
    email: str                    # unique, indexed
    name: str                     # display name (new)
    password_hash: str            # bcrypt hash (new)
    role: str                     # "admin" | "user"
    is_active: bool
    created_at: datetime
    updated_at: datetime          # (new, for refresh token tracking)
```

**Role resolution**: The frontend currently defines 5 roles (`sys_admin`, `state_secretary`, `branch_organiser`, `volunteer`, `read_only`). The backend only has 2 (`admin`, `user`). The spec should reconcile these. Reconcile to 4 roles:

| Role | Backend value | Permission level |
|---|---|---|
| System Admin | `sys_admin` | Full access, user management, system config |
| Organiser | `organiser` | Member CRUD, imports, ERA checks, tags |
| Volunteer | `volunteer` | View members, run checks, no exports |
| Read Only | `read_only` | View dashboard and member list only |

The backend will validate role-based permissions via dependency injection (same pattern as existing `get_current_admin_user` but with a permission matrix).

## Implementation Plan

### Phase 1: Backend Auth (Python FastAPI)

**File: `src/api/auth.py`** — Replace entire file.

1. Remove Firebase imports and initialization
2. Add JWT utilities:
   - `create_access_token(data: dict) -> str`
   - `create_refresh_token(user_id: int) -> str`
   - `decode_access_token(token: str) -> dict`
3. Add password utilities:
   - `hash_password(password: str) -> str` (bcrypt)
   - `verify_password(password: str, hash: str) -> bool`
4. Replace `verify_firebase_token` with `verify_access_token`:
   - Extract Bearer token from Authorization header
   - Decode and validate JWT
   - Fetch user from DB by `user_id` in token payload
   - Return User or raise 401

**New endpoints in `src/api/routers/auth.py`:**

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | No | Accept email + password, return access + refresh tokens |
| POST | `/auth/refresh` | No (uses httpOnly cookie) | Rotate refresh token, return new access + refresh tokens |
| POST | `/auth/logout` | Yes | Invalidate refresh token |
| GET | `/auth/me` | Yes | Return current user + permissions |
| POST | `/auth/change-password` | Yes | Change password (requires current password) |
| POST | `/auth/users` | Admin | Create new user with password |

**Update `src/api/models.py`:**
- Add `name`, `password_hash`, `updated_at` columns to `User`
- Remove `firebase_uid` column
- Add `RefreshToken` model:
  ```python
  class RefreshToken(Base):
      __tablename__ = "refresh_tokens"
      id: int
      user_id: int (FK -> users.id)
      token_hash: str  # SHA-256 hash of the refresh token
      expires_at: datetime
      created_at: datetime
      rotated_at: datetime  # null until rotated
  ```

**Update `src/api/dependencies.py`:**
- Replace Firebase dependency imports with new JWT auth dependency
- Keep the same function signatures: `get_current_active_user`, `get_current_admin_user`

**Update `src/api/main.py`:**
- Remove seed users with Firebase UIDs
- Add seed users with initial password hashes
- Include `auth` router

**Alembic migration:**
- `add_password_hash_and_name_to_users`
- `remove_firebase_uid_from_users`
- `create_refresh_tokens_table`

### Phase 2: Frontend Auth

**File: `frontend/src/contexts/AuthContext.tsx`** — Full rewrite.

1. Remove Firebase imports
2. Add `getAccessToken()` and `getRefreshToken()` functions:
   - Access token stored in memory (React state)
   - Refresh token stored in httpOnly cookie (handled by backend `Set-Cookie`)
3. Implement login:
   ```
   POST /auth/login { email, password }
   → response: { access_token, user }
   → Set-Cookie: refresh_token=...; HttpOnly; Secure; Path=/api/auth
   → Store access_token in React state
   → Store user in React state + localStorage
   ```
4. Implement token refresh:
   - On 401 response from any API call, attempt `POST /auth/refresh` (cookie auto-sent)
   - If refresh succeeds, retry original request with new access_token
   - If refresh fails, log out
5. Backfill the `User` type to match backend model:
   ```typescript
   interface User {
     id: number;
     name: string;
     email: string;
     role: "sys_admin" | "organiser" | "volunteer" | "read_only";
   }
   ```

**File: `frontend/src/services/api.ts`:**
- Add `Authorization: Bearer <token>` header to all requests
- Add 401 interceptor for automatic token refresh + retry
- Remove the stub that never sent tokens

### Phase 3: Rust Backend

**File: `backend-rs/src/auth.rs`** — New file.

1. Add JWT verification using `jsonwebtoken` crate (same `SECRET_KEY`)
2. No need for login/refresh endpoints (Python backend handles auth) or User model — the Rust backend validates the JWT and extracts `user_id`, `email`, `role` from the token claims

Middleware approach: Axum middleware layer that:
1. Extracts `Authorization: Bearer <token>` header
2. Decodes and validates JWT
3. Inserts `Claims { sub: user_id, email, role }` into request extensions
4. Route handlers extract claims via `Extension<Claims>`

**Add to `backend-rs/Cargo.toml`:**
- `jsonwebtoken`
- `serde`, `serde_json` (likely already present)

## Migration Plan

### Zero-downtime approach

1. **Deploy DB migration first**: Add `password_hash`, `name`, `updated_at` columns. `password_hash` is nullable initially.
2. **Deploy backend changes**: New auth endpoints + JWT verification deployed alongside old Firebase verification (both work).
3. **Deploy frontend changes**: New login page uses `/auth/login`, old tokens still work for 15 min.
4. **Backfill passwords**: Generate and email reset links for all existing users, or have them set passwords on first login.
5. **Remove Firebase**: After confirming all users have migrated, remove Firebase verification code and config. Delete Firebase project.
6. **Remove `firebase_uid` column**: Final DB migration drops the column.

### Rollback

- Keep Firebase Admin SDK deployment running in parallel for one release cycle
- If regression found, flip back to Firebase by reverting the frontend deployment and setting the backend to accept both token types

## Security Considerations

### Password Storage
- bcrypt with work factor 12
- Never log or expose password hashes
- Rate-limit login attempts (5 per minute per IP)

### Token Security
- `SECRET_KEY` must be a high-entropy random value (256-bit, generated with `openssl rand -base64 32`)
- Access tokens: 15 min expiry, signed with HS256
- Refresh tokens: 30 days, stored as SHA-256 hash (never plaintext) in DB
- Refresh token cookie: `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`
- On logout: delete server-side refresh token record + clear cookie

### Rate Limiting
Current `src/api/rate_limiter.py` should be extended:
- `/auth/login`: 5 req/min per IP
- `/auth/refresh`: 10 req/min per IP
- All other endpoints: keep existing limits

### Audit Logging
The existing `AuditLog` model already captures user actions. Add:
- `LOGIN_SUCCESS` / `LOGIN_FAILURE` events
- `TOKEN_REFRESH` events
- `PASSWORD_CHANGE` events

### Password Reset Flow
Users without a password (migrated from Firebase) need a set-password flow:
1. Admin generates a one-time setup link from the admin panel
2. Link contains a short-lived (1 hour) setup token signed with `SECRET_KEY`
3. User clicks link, sets password, token is invalidated

## Files Changed

| File | Change |
|---|---|
| `src/api/auth.py` | Full rewrite: Firebase → JWT |
| `src/api/models.py` | Add password_hash, name; remove firebase_uid; add RefreshToken model |
| `src/api/dependencies.py` | Update imports to new auth |
| `src/api/main.py` | Update seed users, include auth router |
| `src/api/rate_limiter.py` | Add login-specific rate limits |
| `src/api/routers/auth.py` | **New** — login, refresh, logout, me, change-password endpoints |
| `src/api/routers/members.py` | No change (uses same dependency interface) |
| `src/api/routers/users.py` | Update for new user creation (password hash) |
| `src/api/security.py` | No change (unrelated to auth) |
| `frontend/src/contexts/AuthContext.tsx` | Full rewrite: JWT login, token management, auto-refresh |
| `frontend/src/services/api.ts` | Add auth headers + 401 interceptor |
| `frontend/src/pages/Login.tsx` | Minimal change (form stays the same) |
| `frontend/src/utils/firebase.ts` | **Delete** (no longer needed) |
| `frontend/src/components/ProtectedRoute.tsx` | No change |
| `Dockerfile` | Remove Firefox/geckodriver deps? (separate concern) |
| `docker-compose.yml` | No change (env vars stay the same) |
| `.env.example` | Remove FIREBASE_CREDENTIALS_PATH, keep SECRET_KEY |
| `backend-rs/src/auth.rs` | **New** — JWT validation middleware |
| `backend-rs/src/api.rs` | Apply auth middleware to routes |
| `backend-rs/Cargo.toml` | Add `jsonwebtoken` |
| `policrm-5f60f-*.json` | **Delete** — no longer committing Firebase service account |

## Open Questions

1. **Password reset flow**: Should we build a "forgot password" email flow, or just rely on admins to set/reset passwords? For Phase 1, admin-only reset is simpler. Full self-service reset can be Phase 2.
2. **Session invalidation on role change**: If an admin changes a user's role, should their existing tokens be invalidated? Best practice is yes — maintain a `token_version` on the User model incremented on role change, included in JWT claims, validated on each request.
3. **Refresh token cookie path**: Should the refresh endpoint be at `/api/auth/refresh` so the cookie can be scoped to `/api/auth/*`, or should it be at a less predictable path to prevent CSRF?
4. **MFA**: Do we need it? Not for Phase 1. Can be layered on later with TOTP if required.
