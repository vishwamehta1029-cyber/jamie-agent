// Signed session cookie: "v1.<expiry unix seconds>.<random nonce>.<HMAC-SHA256 signature>".
// Uses Web Crypto only, so it works in the proxy and in server code, and is unit tested under plain Node.
// The signature is checked with crypto.subtle.verify, which compares in constant time.

export const SESSION_COOKIE = "jamie_dash_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MIN_SECRET_LENGTH = 32;

const enc = new TextEncoder();

function toB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function secretUsable(secret: string | undefined | null): secret is string {
  return typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH;
}

/**
 * The HMAC key. It mixes in the password, so changing DASHBOARD_PASSWORD (or the secret) signs everyone out.
 */
export function sessionKeyMaterial(secret: string, password: string): string {
  return `${secret}\u0000jamie-dashboard-v1\u0000${password}`;
}

async function hmacKey(material: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(material), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signSession(material: string, nowMs: number = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const nonce = toB64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `v1.${exp}.${nonce}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(material, "sign"), enc.encode(payload));
  return `${payload}.${toB64url(new Uint8Array(sig))}`;
}

export async function verifySession(token: string | undefined | null, material: string, nowMs: number = Date.now()): Promise<boolean> {
  if (!token || typeof token !== "string" || token.length > 200 || !material) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  if (!/^\d{1,12}$/.test(parts[1])) return false;
  const exp = Number(parts[1]);
  const now = Math.floor(nowMs / 1000);
  if (exp <= now || exp > now + SESSION_TTL_SECONDS + 300) return false;
  const sig = fromB64url(parts[3]);
  if (!sig || sig.length !== 32) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(material, "verify"), sig, enc.encode(parts.slice(0, 3).join(".")));
  } catch {
    return false;
  }
}
