import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth, type AuthEnv } from "./auth";

const app = new Hono<{ Bindings: AuthEnv }>();

// CORS for frontend (configured via env or wildcard for dev)
app.use("*", cors({
  origin: (origin) => origin || "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
}));

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Mount Better Auth handler at /api/auth/*
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// Session middleware — injects X-User-* headers for all other requests
app.use("*", async (c, next) => {
  // Skip auth routes (already handled above)
  if (c.req.path.startsWith("/api/auth/") || c.req.path === "/health") {
    return next();
  }

  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (session) {
    c.set("user", session.user as never);
    c.set("session", session.session as never);
  }

  await next();
});

// Proxy all other requests to the Rust backend with X-User-* headers
app.all("/*", async (c) => {
  const backendUrl = c.env.BACKEND_URL || "http://localhost:8080";
  const path = c.req.path;
  const url = `${backendUrl}${path}${c.req.url.includes("?") ? "?" + c.req.url.split("?")[1] : ""}`;

  const user = c.get("user") as { id: string; email: string; name: string; role: string; branchId?: string } | undefined;

  const headers = new Headers(c.req.raw.headers);
  headers.delete("host");

  // Strip any forged identity headers before setting fresh ones below
  for (const h of ["x-user-id","x-user-email","x-user-name","x-user-role","x-user-branch-id"]) {
    headers.delete(h);
  }
  if (user) {
    headers.set("X-User-Id", user.id);
    headers.set("X-User-Email", user.email);
    headers.set("X-User-Name", user.name);
    headers.set("X-User-Role", user.role || "organiser");
    if (user.branchId) {
      headers.set("X-User-Branch-Id", user.branchId);
    }
  }

  const body = c.req.method === "GET" || c.req.method === "HEAD"
    ? undefined
    : await c.req.raw.clone().arrayBuffer();

  try {
    const response = await fetch(url, {
      method: c.req.method,
      headers,
      body: body || null,
    });

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (e) {
    console.error("Proxy error:", e);
    return c.json({ error: "Backend unavailable" }, 502);
  }
});

export default app;
