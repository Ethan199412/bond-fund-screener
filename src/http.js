// 通用 HTTP 抓取与并发控制（零依赖，基于 Node 18+ 全局 fetch）
import { HTTP } from './config.js';

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 带重试的 GET 文本抓取
export async function getText(url, { retries = HTTP.retries, timeoutMs = HTTP.timeoutMs, headers = {} } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: {
          'User-Agent': HTTP.userAgent,
          Referer: HTTP.referer,
          Accept: '*/*',
          ...headers,
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (i < retries) await sleep(600 * (i + 1));
    }
  }
  throw lastErr;
}

// 简单并发池：对 items 依次执行 worker，控制并发与请求间隔；单条失败不中断整体。
export async function mapPool(items, worker, { concurrency = HTTP.concurrency, delayMs = HTTP.delayMs } = {}) {
  const results = new Array(items.length);
  let idx = 0;
  async function run() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        results[i] = { __error: e && e.message ? e.message : String(e) };
      }
      if (delayMs) await sleep(delayMs);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, run));
  return results;
}
