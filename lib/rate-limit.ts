import "server-only";
import { headers } from "next/headers";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function rateLimit(options: {
  action: string;
  windowMs: number;
  max: number;
}): Promise<{ ok: boolean; remaining: number }> {
  const ip = await clientIp();
  const key = `${options.action}:${ip}`;
  const now = Date.now();

  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true, remaining: options.max - 1 };
  }

  existing.count += 1;
  if (existing.count > options.max) return { ok: false, remaining: 0 };
  return { ok: true, remaining: options.max - existing.count };
}
