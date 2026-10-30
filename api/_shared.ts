/**
 * Shared helpers for the serverless proxy functions (api/). Files prefixed with "_" are
 * not deployed as routes. These proxies exist so third-party calls that need a key or
 * fail cross-origin go through the server (handoff: external services). Every call has a
 * timeout, one retry, and returns a visible "not available" rather than a silent default.
 */

export interface Req {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}
export interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

export function qp(req: Req, name: string): string | undefined {
  const v = req.query[name];
  return Array.isArray(v) ? v[0] : v;
}

/** fetch with an abort timeout and a single retry on network/5xx failure. */
export async function fetchWithTimeout(
  url: string,
  opts: { timeoutMs?: number; retries?: number; init?: RequestInit } = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const retries = opts.retries ?? 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts.init, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      lastErr = new Error(`upstream ${res.status}`);
      if (res.status < 500) return res; // 4xx: don't retry
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("request failed");
}

/** Standard "not available" response (handoff failure handling). */
export function notAvailable(res: Res, service: string, detail?: string): void {
  res.status(503).json({ available: false, service, detail: detail ?? "not available" });
}
