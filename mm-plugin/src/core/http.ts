// Small fetch helpers: timeouts, JSON, and a bounded-concurrency map.

export type FetchLike = typeof fetch;

export class HttpError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly url: string) {
    super(message);
    this.name = "HttpError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET JSON, retrying 429/502/503 with backoff (the free Predge tier answers 503 "busy" at capacity and 429 per minute). */
export async function getJson<T = unknown>(url: string, opts: { fetch?: FetchLike; timeoutMs?: number; retries?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 6;
  for (let attempt = 0; ; attempt++) {
    try {
      return await getJsonOnce<T>(url, opts);
    } catch (e) {
      const st = e instanceof HttpError ? e.status : null;
      if (attempt >= retries || (st !== 429 && st !== 502 && st !== 503)) throw e;
      if (st === 502 && attempt >= 2) throw e;
      // 429 means "try again in a minute": wait longer than for a momentary 503
      await sleep((st === 429 ? 15_000 : Math.min(8000, 750 * 2 ** attempt)) + Math.random() * 1000);
    }
  }
}

async function getJsonOnce<T>(url: string, opts: { fetch?: FetchLike; timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await (opts.fetch ?? fetch)(url, { headers: { accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 200).replace(/\s+/g, " "); } catch { /* ignore */ }
      throw new HttpError(`GET ${url}: HTTP ${res.status}${detail ? ` (${detail})` : ""}`, res.status, url);
    }
    return (await res.json()) as T;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new HttpError(`GET ${url}: timed out`, null, url);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
