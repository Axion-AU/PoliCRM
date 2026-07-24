import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/schema";

export type AuthEnv = {
  DB: D1Database;
  KV: KVNamespace;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  BACKEND_URL: string;
};

export function createAuth(env: AuthEnv) {
  const db = drizzle(env.DB);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "organiser",
          input: false,
        },
        branchId: {
          type: "string",
          required: false,
          input: true,
        },
      },
    },
    secondaryStorage: {
      get: async (key) => {
        try {
          return await env.KV.get(key);
        } catch {
          return null;
        }
      },
      set: async (key, value, ttl) => {
        const opts: { expirationTtl?: number } = {};
        if (ttl) opts.expirationTtl = ttl;
        await env.KV.put(key, value, opts);
      },
      delete: async (key) => {
        await env.KV.delete(key);
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // When a user is created via Better Auth, sync it to the Rust backend
            // via a POST to BACKEND_URL/users
            try {
              const backendUrl = env.BACKEND_URL;
              await fetch(`${backendUrl}/users`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: user.id,
                  email: user.email,
                  name: user.name,
                  role: (user as Record<string, string>).role || "organiser",
                }),
              });
            } catch (e) {
              console.error("Failed to sync user to backend:", e);
            }
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
  });
}
