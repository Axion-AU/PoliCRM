export interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: "sys_admin" | "state_secretary" | "branch_organiser" | "volunteer" | "read_only";
  passwordHash: string;
  isActive: boolean;
  createdAt: string;
}

export interface SessionData {
  userId: string;
  email: string;
  expiresAt: string;
}

const USER_PREFIX = "user:";
const SESSION_PREFIX = "session:";

export async function getUserByEmail(env: Env, email: string): Promise<StoredUser | null> {
  const raw = await env.USERS_KV.get(`${USER_PREFIX}${email.toLowerCase().trim()}`);
  if (!raw) return null;
  return JSON.parse(raw) as StoredUser;
}

export async function upsertUser(env: Env, user: StoredUser): Promise<void> {
  const key = `${USER_PREFIX}${user.email.toLowerCase().trim()}`;
  await env.USERS_KV.put(key, JSON.stringify(user));
}

export async function createSession(env: Env, userId: string, email: string, ttlSeconds: number): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const session: SessionData = { userId, email, expiresAt };
  await env.SESSIONS_KV.put(`${SESSION_PREFIX}${sessionId}`, JSON.stringify(session), {
    expirationTtl: ttlSeconds,
  });
  return sessionId;
}

export async function getSession(env: Env, sessionId: string): Promise<SessionData | null> {
  const raw = await env.SESSIONS_KV.get(`${SESSION_PREFIX}${sessionId}`);
  if (!raw) return null;
  return JSON.parse(raw) as SessionData;
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.SESSIONS_KV.delete(`${SESSION_PREFIX}${sessionId}`);
}

export function generateUserId(): string {
  return crypto.randomUUID();
}
