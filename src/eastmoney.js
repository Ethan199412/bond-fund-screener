// 天天基金(东方财富)公开接口抓取与解析 + 磁盘缓存
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getText } from './http.js';
import { DIRS, CACHE_TTL_DAYS } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, DIRS.cache);

const DAY = 24 * 3600 * 1000;

function cachePath(kind, code) {
  return path.join(CACHE_DIR, kind, `${code}.txt`);
}
function readCache(kind, code, ttlDays) {
  const p = cachePath(kind, code);
  try {
    const st = fs.statSync(p);
    if (Date.now() - st.mtimeMs > ttlDays * DAY) return null;
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}
function writeCache(kind, code, text) {
  try {
    const p = cachePath(kind, code);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, 'utf8');
  } catch {
    /* 缓存失败不影响主流程 */
  }
}

// ---------- 1. 全量基金列表 ----------
// 来源: https://fund.eastmoney.com/js/fundcode_search.js
// 返回: var r = [["代码","拼音缩写","名称","细分类型","全拼"], ...]
const LIST_CODE = '__list__';
export async function getFundList() {
  const cached = readCache('list', LIST_CODE, CACHE_TTL_DAYS.list);
  if (cached) return JSON.parse(cached);
  const url = 'https://fund.eastmoney.com/js/fundcode_search.js';
  const text = await getText(url);
  const m = text.match(/var\s+r\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) throw new Error('基金列表解析失败');
  const arr = JSON.parse(m[1]);
  const list = arr.map((row) => ({
    code: row[0],
    pinyin: row[1],
    name: row[2],
    type: row[3],
    fullPinyin: row[4],
  }));
  writeCache('list', LIST_CODE, JSON.stringify(list));
  return list;
}

// 是否属于债券类基金（细分类型里带“债”或“固收”）
export function isBondFund(f) {
  return !!f && !!f.type && (f.type.includes('债') || f.type.includes('固收'));
}

// ---------- 2. 净值/规模/经理 (pingzhongdata) ----------
// 来源: https://fund.eastmoney.com/pingzhongdata/{code}.js
export async function getPingzhong(code) {
  const cached = readCache('pz', code, CACHE_TTL_DAYS.pz);
  const text = cached || (await getText(`https://fund.eastmoney.com/pingzhongdata/${code}.js`));
  if (!cached) writeCache('pz', code, text);
  return parsePingzhong(text);
}

// 从 text 中定位 var 名，取出其后第一个 [ 或 { 开头的、括号配平的 JSON 片段
function extractBalanced(text, varName) {
  const key = varName + ' =';
  const i = text.indexOf(key);
  if (i < 0) return null;
  let start = text.indexOf('[', i);
  let open = '[';
  let close = ']';
  const brace = text.indexOf('{', i);
  if (brace >= 0 && (start < 0 || brace < start)) {
    start = brace;
    open = '{';
    close = '}';
  }
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return text.slice(start, j + 1);
    }
  }
  return null;
}

function parsePingzhong(text) {
  const grab = (re) => {
    const m = text.match(re);
    return m ? m[1] : null;
  };
  const out = {
    name: grab(/fS_name\s*=\s*"([^"]*)"/),
    code: grab(/fS_code\s*=\s*"([^"]*)"/),
    accNav: [], // 累计净值 [[毫秒时间戳, 净值], ...]
    manager: null, // { name, workTime }
    size: null, // { value(亿元), date }
    bondPctOfNav: null, // 债券占净比(%)，杠杆率代理
    bondPctDate: null, // 上述值的披露日期
  };

  // 累计净值（含分红，比单位净值更适合算回撤/年化）
  const acm = extractBalanced(text, 'Data_ACWorthTrend');
  if (acm) {
    try {
      out.accNav = JSON.parse(acm);
    } catch {
      /* ignore */
    }
  }

  // 现任基金经理
  const mgr = extractBalanced(text, 'Data_currentFundManager');
  if (mgr) {
    try {
      const arr = JSON.parse(mgr);
      if (arr && arr.length) {
        out.manager = { name: arr[0].name, workTime: arr[0].workTime };
      }
    } catch {
      /* ignore */
    }
  }

  // 净资产规模（亿元）—— 取最新一期
  const fs = extractBalanced(text, 'Data_fluctuationScale');
  if (fs) {
    try {
      const obj = JSON.parse(fs);
      const s = obj.series;
      if (s && s.length && obj.categories && obj.categories.length) {
        out.size = {
          value: Number(s[s.length - 1].y),
          date: obj.categories[obj.categories.length - 1],
        };
      }
    } catch {
      /* ignore */
    }
  }

  // 债券占净比（%）—— 杠杆率代理，取最新一期季报披露值
  const alloc = extractBalanced(text, 'Data_assetAllocation');
  if (alloc) {
    try {
      const obj = JSON.parse(alloc);
      const series = obj.series && obj.series.find((s) => s.name === '债券占净比');
      if (series && series.data && series.data.length) {
        const v = Number(series.data[series.data.length - 1]);
        if (v > 0) {
          out.bondPctOfNav = v;
          out.bondPctDate = obj.categories && obj.categories[obj.categories.length - 1];
        }
      }
    } catch {
      /* ignore */
    }
  }

  return out;
}

// ---------- 3. 费率 / 成立日期 / 细分类型 / 净资产 (F10 费率页) ----------
// 来源: https://fundf10.eastmoney.com/jjfl_{code}.html
export async function getFeeInfo(code) {
  const cached = readCache('jjfl', code, CACHE_TTL_DAYS.jjfl);
  const text = cached || (await getText(`https://fundf10.eastmoney.com/jjfl_${code}.html`));
  if (!cached) writeCache('jjfl', code, text);
  return parseFeeInfo(text);
}

function parseFeeInfo(text) {
  // 运作费用表：管理费率 / 托管费率 / 销售服务费率
  const pct = (label) => {
    const re = new RegExp(label + '<\\/td>\\s*<td[^>]*>([\\d.]+)\\s*%');
    const m = text.match(re);
    return m ? parseFloat(m[1]) : null;
  };
  const mgmt = pct('管理费率');
  const cust = pct('托管费率');
  const sales = pct('销售服务费率');
  const total =
    mgmt == null && cust == null && sales == null
      ? null
      : (mgmt ?? 0) + (cust ?? 0) + (sales ?? 0);

  // 净资产规模（亿元）
  const sz = text.match(/净资产规模：<span>\s*([\d.]+)亿元/);
  const size = sz ? parseFloat(sz[1]) : null;

  // 成立日期
  const ed = text.match(/成立日期：<span>([\d-]+)<\/span>/);
  const establishDate = ed ? ed[1] : null;

  // 细分类型（如“债券型-信用债”）
  const tp = text.match(/类型：<span>([^<]+)<\/span>/);
  const type = tp ? tp[1].trim() : null;

  return { mgmt, cust, sales, total, size, establishDate, type };
}

// ---------- 4. 细分类型 → 类别 ----------
// 部分可转债基金在天天基金被标成“混合二级”，因此同时参考基金名称里的“转债/可转债”字样。
// 纯债内部细分：中短债/短债 > 普通纯债（信用债/利率债）> 长债。
export function categorize(type, name = '') {
  const t = type || '';
  const n = name || '';
  if (t.includes('可转债') || t.includes('可转') || n.includes('可转债') || n.includes('转债') || n.includes('可转')) {
    return { key: 'convertible', label: '可转债' };
  }
  if (t.includes('中短债') || n.includes('短债')) return { key: 'short', label: '中短债/短债' };
  if (t.includes('长债')) return { key: 'long', label: '长债' };
  if (t.includes('二级') || t === 'QDII-混合债') return { key: 'secondary', label: '二级债' };
  if (t.includes('一级')) return { key: 'primary', label: '一级债' };
  if (t.includes('偏债')) return { key: 'hybridBond', label: '偏债混合' };
  if (t.includes('固收') || t.includes('指数')) return { key: 'index', label: '债券指数' };
  if (t.includes('信用债') || t.includes('利率债') || t === 'QDII-纯债') return { key: 'pure', label: '普通纯债' };
  if (t.includes('债') || t.includes('固收')) return { key: 'pure', label: '普通纯债' };
  return { key: 'other', label: '其他' };
}
