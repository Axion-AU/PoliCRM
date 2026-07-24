import { Hono } from "hono";
import { cors } from "hono/cors";
import { signToken, verifyToken, type TokenPayload } from "./auth";
import { getUserByEmail, upsertUser, generateUserId } from "./kv";

export interface Env {
  USERS_KV: KVNamespace;
  SESSIONS_KV: KVNamespace;
  AUTH_SECRET: string;
  BACKEND_URL: string;
  JWT_ISSUER: string;
  TOKEN_EXPIRY_SECONDS: string;
}

type Bindings = Env;

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({
  origin: ["http://localhost:5173", "http://localhost:4173"],
  credentials: true,
}));

app.post("/auth/login", async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const user = await getUserByEmail(c.env, email);
  if (!user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  if (!user.isActive) {
    return c.json({ error: "Account is inactive" }, 403);
  }

  const bcrypt = await import("bcryptjs");
  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const expiry = parseInt(c.env.TOKEN_EXPIRY_SECONDS || "86400", 10);
  const token = await signToken(
    { sub: user.id, email: user.email, role: user.role, exp: Math.floor(Date.now() / 1000) + expiry },
    c.env,
  );

  return c.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

app.post("/auth/logout", async (c) => {
  return c.json({ message: "Logged out" });
});

app.get("/auth/session", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ user: null }, 200);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env);
  if (!payload) {
    return c.json({ user: null }, 200);
  }

  return c.json({
    user: {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    },
  });
});

app.get("/auth/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  const user = await getUserByEmail(c.env, payload.email);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
});

app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const backendUrl = c.env.BACKEND_URL || "http://localhost:8000";
  const target = `${backendUrl}${url.pathname}${url.search}`;

  const headers = new Headers(c.req.raw.headers);

  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, c.env);
    if (payload) {
      headers.set("X-User-Id", payload.sub);
      headers.set("X-User-Email", payload.email);
      headers.set("X-User-Role", payload.role);
    }
  }

  headers.delete("host");

  const body = c.req.raw.body;
  const response = await fetch(target, {
    method: c.req.method,
    headers,
    body: ["GET", "HEAD"].includes(c.req.method) ? undefined : body,
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
});

export default app;
