// 本地服务：静态页面 + 筛选 API（零依赖，Node 18+）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScreen, toCSV } from './src/screen.js';
import { DEFAULT_MAX_FUNDS } from './src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'public', 'dist');
const PORT = Number(process.env.PORT) || 3210;

const jobs = new Map();
let jobSeq = 0;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}
function json(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function serveStatic(res, pathname) {
  // 生产模式：托管 React 构建产物 public/dist；尚未构建时给出提示
  if (!fs.existsSync(DIST)) {
    const hint = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>债券基金筛选器</title></head><body style="font-family:sans-serif;padding:40px;line-height:1.9">
<h2>前端尚未构建</h2>
<p>请先构建 React 前端，或改用开发模式：</p>
<pre>npm install
npm run build   # 构建后由本服务托管，访问 http://localhost:${PORT}
npm run dev     # 开发模式（热更新）：前端 http://localhost:5173，另开终端 node server.js</pre>
</body></html>`;
    return send(res, 200, hint, { 'Content-Type': 'text/html; charset=utf-8' });
  }
  let p = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(DIST, p));
  if (!file.startsWith(DIST)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not Found');
    const ext = path.extname(file).toLowerCase();
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // 启动筛选任务
  if (p === '/api/screen') {
    const fundsParam = (url.searchParams.get('funds') || '').trim();
    // 注意：0 表示不限量，不能用 || 兜底（0 会被当成 falsy）
    const rawMax = url.searchParams.get('maxFunds');
    let maxFunds = rawMax == null || rawMax.trim() === '' ? DEFAULT_MAX_FUNDS : parseInt(rawMax, 10);
    if (Number.isNaN(maxFunds) || maxFunds < 0) maxFunds = DEFAULT_MAX_FUNDS;
    const funds = fundsParam ? fundsParam.split(/[,，\s]+/).filter(Boolean) : null;

    const jobId = String(++jobSeq);
    const job = {
      id: jobId,
      status: 'running',
      progress: { done: 0, total: 0, current: null },
      results: [],
      error: null,
    };
    jobs.set(jobId, job);

    runScreen({
      funds,
      maxFunds,
      onProgress: (pr) => {
        job.progress = pr;
      },
    })
      .then(({ total, results }) => {
        job.status = 'done';
        job.results = results;
        job.total = total;
      })
      .catch((err) => {
        job.status = 'error';
        job.error = err && err.message ? err.message : String(err);
      });

    return json(res, 200, { jobId });
  }

  // 查询任务进度 / 结果 / 导出
  if (p.startsWith('/api/job/')) {
    const parts = p.split('/').filter(Boolean); // ["api","job",id,ext?]
    const jobId = parts[2];
    const job = jobs.get(jobId);
    if (!job) return json(res, 404, { error: '任务不存在' });
    if (parts[3] === 'csv') {
      const csv = toCSV(job.results);
      return send(res, 200, '﻿' + csv, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bond-funds.csv"',
      });
    }
    if (parts[3] === 'json') {
      return send(res, 200, JSON.stringify(job.results, null, 2), {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bond-funds.json"',
      });
    }
    return json(res, 200, job);
  }

  return serveStatic(res, p);
});

server.listen(PORT, () => {
  console.log(`债券基金筛选器已启动：http://localhost:${PORT}`);
});
