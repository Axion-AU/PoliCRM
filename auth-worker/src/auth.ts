import type { Env } from "./index";

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
  iss: string;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getSigningKey(env: Env): Promise<CryptoKey> {
  const rawKey = env.AUTH_SECRET;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(rawKey.padEnd(32, ".").slice(0, 32));
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(payload: Omit<TokenPayload, "iat" | "iss">, env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: TokenPayload = {
    ...payload,
    iat: now,
    iss: env.JWT_ISSUER,
  };

  const encoder = new TextEncoder();
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));

  const key = await getSigningKey(env);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${header}.${body}`),
  );

  return `${header}.${body}.${base64UrlEncode(signature)}`;
}

export async function verifyToken(token: string, env: Env): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, bodyB64, sigB64] = parts;
  const encoder = new TextEncoder();

  const key = await getSigningKey(env);
  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(sigB64),
    encoder.encode(`${headerB64}.${bodyB64}`),
  );

  if (!isValid) return null;

  const decoder = new TextDecoder();
  const payload: TokenPayload = JSON.parse(decoder.decode(base64UrlDecode(bodyB64)));

  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}
