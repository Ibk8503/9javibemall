import dns from "node:dns/promises";
import net from "node:net";

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./,
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^198\.18\./,
  /^198\.19\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^224\./,
  /^240\./,
  /^255\.255\.255\.255$/,
];

const PRIVATE_IPV6 = [
  /^::1$/,
  /^fe[89ab][0-9a-f]:/i,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^::ffff:(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.|169\.254\.)/i,
  /^::ffff:(?:0:|169\.254\.|192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/i,
];

function isPrivateIP(ip: string): boolean {
  if (net.isIPv6(ip)) {
    if (PRIVATE_IPV6.some((r) => r.test(ip))) return true;
    if (ip === "::") return true;
    return false;
  }
  if (PRIVATE_IP_RANGES.some((r) => r.test(ip))) return true;
  return false;
}

export async function validateWebhookUrl(raw: string): Promise<{ ok: boolean; error?: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid webhook URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https are allowed" };
  }

  if (url.username || url.password) {
    return { ok: false, error: "Credentials not allowed in webhook URL" };
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "::1" || hostname.endsWith(".localhost")) {
    return { ok: false, error: "Localhost is not allowed" };
  }

  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      return { ok: false, error: "Private/loopback/link-local addresses are not allowed" };
    }
    return { ok: true };
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const { address } of addresses) {
      if (isPrivateIP(address)) {
        return { ok: false, error: "Webhook resolves to a private/internal address" };
      }
    }
  } catch (e) {
    console.warn("Webhook DNS lookup failed:", e);
    return { ok: false, error: "Failed to resolve webhook hostname" };
  }

  return { ok: true };
}

export async function safeFetchWebhook(
  url: string,
  init: RequestInit,
  timeoutMs = 5000,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, redirect: "manual", signal: ctrl.signal });
    if (res.status >= 300 && res.status < 400) {
      throw new Error("Redirects are not allowed for webhook requests");
    }
    return res;
  } finally {
    clearTimeout(t);
  }
}
