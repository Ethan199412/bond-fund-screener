// 本地服务：静态页面 + 筛选 API（零依赖，Node 18+）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScreen, toCSV, queryResults } from './src/screen.js';
import { DEFAULT_MAX_FUNDS } from './src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'public', 'dist');
const RESULTS_DIR = path.join(__dirname, 'data', 'results');
const LATEST_PATH = path.join(RESULTS_DIR, 'latest.json');
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

// 从磁盘读取已落盘的筛选结果（不驻留内存）
function readResults(job) {
  if (!job.resultPath) return [];
  try {
    return JSON.parse(fs.readFileSync(job.resultPath, 'utf8'));
  } catch {
    return [];
  }
}

// 解析分页查询参数
function parseResultQuery(url) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10) || 50));
  const sort = url.searchParams.get('sort') || 'composite';
  const dir = url.searchParams.get('dir') === 'asc' ? 1 : -1;
  const filter = url.searchParams.get('filter') || 'all';
  const company = (url.searchParams.get('company') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { page, pageSize, sort, dir, filter, company };
}

// 读取最近一次完整结果（含元信息），不存在返回 null
function readLatest() {
  try {
    return JSON.parse(fs.readFileSync(LATEST_PATH, 'utf8'));
  } catch {
    return null;
  }
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

  // 最近一次结果：打开页面即加载，秒出
  if (p === '/api/latest') {
    const latest = readLatest();
    if (!latest) return json(res, 200, { exists: false });
    return json(res, 200, {
      exists: true,
      savedAt: latest.savedAt,
      total: latest.total,
      count: latest.count,
      funds: latest.funds,
      maxFunds: latest.maxFunds,
    });
  }
  if (p === '/api/latest/results') {
    const latest = readLatest();
    if (!latest) return json(res, 200, { total: 0, filtered: 0, items: [], page: 1, pageSize: 50, pages: 1 });
    return json(res, 200, queryResults(latest.results, parseResultQuery(url)));
  }
  if (p === '/api/latest/csv') {
    const latest = readLatest();
    const csv = latest ? toCSV(latest.results) : '';
    return send(res, 200, '﻿' + csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bond-funds.csv"',
    });
  }
  if (p === '/api/latest/json') {
    const latest = readLatest();
    return send(res, 200, JSON.stringify(latest ? latest.results : [], null, 2), {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bond-funds.json"',
    });
  }

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
      total: 0,
      count: 0,
      resultPath: null,
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
        job.total = total;
        job.count = results.length;
        let err = null;
        // 结果落盘，不常驻内存
        try {
          fs.mkdirSync(RESULTS_DIR, { recursive: true });
          const p = path.join(RESULTS_DIR, `${jobId}.json`);
          fs.writeFileSync(p, JSON.stringify(results), 'utf8');
          job.resultPath = p;
          // 更新「最近一次结果」，供下次打开直接复用
          fs.writeFileSync(
            LATEST_PATH,
            JSON.stringify({
              savedAt: new Date().toISOString(),
              total,
              count: results.length,
              funds: funds || null,
              maxFunds,
              results,
            }),
            'utf8'
          );
        } catch (e) {
          err = '结果写盘失败：' + (e.message || e);
        }
        // 状态最后设置：轮询看到 done 时，文件一定已就绪
        job.status = err ? 'error' : 'done';
        job.error = err;
      })
      .catch((err) => {
        job.status = 'error';
        job.error = err && err.message ? err.message : String(err);
      });

    return json(res, 200, { jobId });
  }

  // 查询任务进度 / 分页结果 / 导出
  if (p.startsWith('/api/job/')) {
    const parts = p.split('/').filter(Boolean); // ["api","job",id,sub?]
    const jobId = parts[2];
    const job = jobs.get(jobId);
    if (!job) return json(res, 404, { error: '任务不存在' });

    if (parts[3] === 'csv') {
      const csv = toCSV(readResults(job));
      return send(res, 200, '﻿' + csv, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bond-funds.csv"',
      });
    }
    if (parts[3] === 'json') {
      return send(res, 200, JSON.stringify(readResults(job), null, 2), {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bond-funds.json"',
      });
    }
    if (parts[3] === 'results') {
      if (job.status !== 'done' || !job.resultPath) {
        return json(res, 200, { total: 0, filtered: 0, items: [], page: 1, pageSize: 50, pages: 1 });
      }
      return json(res, 200, queryResults(readResults(job), parseResultQuery(url)));
    }

    // 默认：只返回元信息，不返回 results（避免整包传输）
    return json(res, 200, {
      id: job.id,
      status: job.status,
      progress: job.progress,
      total: job.total,
      count: job.count,
      error: job.error,
    });
  }

  return serveStatic(res, p);
});

server.listen(PORT, () => {
  console.log(`债券基金筛选器已启动：http://localhost:${PORT}`);
});
