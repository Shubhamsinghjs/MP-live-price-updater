/**
 * Resolves myshopify.com shop domain when the iframe request is missing `shop`
 * but has `host` (base64) or when Shopify Admin sends a Referer like
 * /store/{slug}/apps/... — fixes manual /auth/login after reinstall.
 */

import { redirect } from "@remix-run/node";

function shopFromHostParam(hostBase64: string | null): string | null {
  if (!hostBase64) return null;
  try {
    const decoded = Buffer.from(hostBase64, "base64").toString("utf8");
    const match = decoded.match(/admin\.shopify\.com\/store\/([^/]+)/);
    if (match?.[1]) return `${match[1]}.myshopify.com`;
  } catch {
    return null;
  }
  return null;
}

function shopFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    if (!u.hostname.includes("shopify")) return null;
    const m = u.pathname.match(/^\/store\/([^/]+)/);
    if (m?.[1]) return `${m[1]}.myshopify.com`;
  } catch {
    return null;
  }
  return null;
}

function normalizeShopParam(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com\/?$/.test(s)) {
    return s.replace(/\/$/, "");
  }
  return null;
}

/**
 * Best-effort shop for OAuth when `shop` query is missing (e.g. stripped redirect).
 */
export function resolveEmbeddedShop(request: Request): string | null {
  const url = new URL(request.url);

  const fromQuery = normalizeShopParam(url.searchParams.get("shop"));
  if (fromQuery) return fromQuery;

  const fromHost = shopFromHostParam(url.searchParams.get("host"));
  if (fromHost) return fromHost;

  return shopFromReferer(request.headers.get("referer"));
}

const PRESERVE_AUTH_KEYS = [
  "host",
  "embedded",
  "session",
  "id_token",
  "hmac",
  "timestamp",
  "shopify-reload",
];

export function redirectToAuthWithContext(request: Request, shop: string): never {
  const url = new URL(request.url);
  const target = new URL("/auth", url.origin);
  target.searchParams.set("shop", shop);
  for (const key of PRESERVE_AUTH_KEYS) {
    const v = url.searchParams.get(key);
    if (v) target.searchParams.set(key, v);
  }
  throw redirect(target.toString());
}
