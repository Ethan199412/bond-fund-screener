// 筛选主流程：候选池 → 抓数据 → 算指标 → 打分 → 排序
import {
  getFundList,
  isBondFund,
  getPingzhong,
  getFeeInfo,
  categorize,
} from './eastmoney.js';
import { computeAnnualized, computeMaxDrawdown, computeRecoveryDays, parseManagerYears } from './metrics.js';
import { scoreFund } from './score.js';
import { LOOKBACK, DEFAULT_MAX_FUNDS, INCLUDE_CATEGORIES } from './config.js';
import { mapPool, sleep } from './http.js';

const DAY = 86400000;

// options: { funds: [code,...] | null, maxFunds: number, onProgress: fn }
export async function runScreen({ funds = null, maxFunds = DEFAULT_MAX_FUNDS, onProgress = null } = {}) {
  const list = await getFundList();

  let candidates;
  if (funds && funds.length) {
    const set = new Set(funds);
    candidates = list.filter((f) => set.has(f.code));
  } else {
    candidates = list.filter(isBondFund);
    // 类型白名单预筛：只保留目标类别
    candidates = candidates.filter((f) => INCLUDE_CATEGORIES.includes(categorize(f.type, f.name).key));
    // 同源份额（A/C/E…）去重，每组只精算代表份额
    candidates = dedupeShares(candidates);
    if (maxFunds > 0) candidates = candidates.slice(0, maxFunds);
  }
  candidates.sort((a, b) => a.code.localeCompare(b.code));

  const total = candidates.length;
  const results = [];
  await mapPool(
    candidates,
    async (f, i) => {
      const item = await scoreOne(f);
      if (item) results.push(item);
      if (onProgress) onProgress({ done: i + 1, total, current: f.code });
    },
    {}
  );

  results.sort((a, b) => (b.composite ?? -1) - (a.composite ?? -1));
  results.forEach((r, i) => (r.rank = i + 1));
  return { total: candidates.length, results };
}

// 去掉末尾份额字母（A/C/E/B/D/Y…），得到同源基金的基名
function baseName(name) {
  return String(name || '').replace(/[ABCDEY]$/i, '').trim();
}

// 同源份额（如 A/C 份额对）去重：每组只保留代表份额，其余记入 peers
function dedupeShares(funds) {
  const groups = new Map();
  for (const f of funds) {
    const base = baseName(f.name);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(f);
  }
  const suffixRank = (f) => {
    const name = String(f.name || '');
    const s = name.slice(-1).toUpperCase();
    if (s === 'A') return 0;
    if (!/[A-Z]$/.test(name)) return 1;
    if (s === 'C') return 2;
    return 3;
  };
  const reps = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => suffixRank(a) - suffixRank(b) || a.code.localeCompare(b.code));
    const rep = arr[0];
    rep.peers = arr.slice(1).map((x) => ({ code: x.code, name: x.name }));
    reps.push(rep);
  }
  return reps;
}

async function scoreOne(f) {
  // 净值数据是核心，抓取失败重试一次；费率页失败可容忍（对应指标置空、权重重新归一）
  let pz = null;
  for (let attempt = 0; attempt < 2 && !pz; attempt++) {
    try {
      pz = await getPingzhong(f.code);
    } catch {
      pz = null;
    }
    if (!pz && attempt === 0) await sleep(1200);
  }
  if (!pz || !pz.accNav || !pz.accNav.length) return null; // 无净值数据，无法评估

  let fee = null;
  try {
    fee = await getFeeInfo(f.code);
  } catch {
    fee = null;
  }

  const accNav = pz.accNav;
  const annualized3 = computeAnnualized(accNav, LOOKBACK.annualizedYears);
  const annualized5 = computeAnnualized(accNav, LOOKBACK.annualizedYears2);
  // 评分主用 3 年年化；不足 3 年才退回 5 年（一般更不足），再退回 null
  const annualized = annualized3 != null ? annualized3 : annualized5;

  const lookbackDays = LOOKBACK.mddYears * 365;
  const mdd = computeMaxDrawdown(accNav, lookbackDays);
  const rec = computeRecoveryDays(accNav, lookbackDays);

  const managerYears = parseManagerYears(pz.manager && pz.manager.workTime);
  const size = fee && fee.size != null ? fee.size : pz.size && pz.size.value;

  const cat = categorize((fee && fee.type) || f.type, f.name);

  const metrics = {
    mdd: mdd ? mdd.mdd : null,
    recoveryDays: rec ? rec.days : null,
    annualized,
    categoryKey: cat.key,
    leverage: pz.bondPctOfNav,
    size,
    managerYears,
    totalFee: fee ? fee.total : null,
  };
  const { scores, composite } = scoreFund(metrics);

  return {
    rank: 0,
    code: f.code,
    name: f.name,
    type: (fee && fee.type) || f.type,
    category: cat.label,
    categoryKey: cat.key,
    composite,
    scores,
    raw: {
      mdd: mdd ? mdd.mdd : null,
      mddPeakDate: mdd ? mdd.peakDate : null,
      mddTroughDate: mdd ? mdd.troughDate : null,
      recoveryDays: rec ? rec.days : null,
      recoveryTroughDate: rec ? rec.troughDate : null,
      annualized3,
      annualized5,
      leverage: pz.bondPctOfNav,
      leverageDate: pz.bondPctDate,
      size,
      sizeDate: fee && fee.size != null ? null : pz.size && pz.size.date,
      managerName: pz.manager && pz.manager.name,
      managerWorkTime: pz.manager && pz.manager.workTime,
      managerYears,
      mgmtFee: fee ? fee.mgmt : null,
      custFee: fee ? fee.cust : null,
      salesFee: fee ? fee.sales : null,
      totalFee: fee ? fee.total : null,
      establishDate: fee ? fee.establishDate : null,
      navPoints: accNav.length,
      peers: f.peers || [],
    },
  };
}

// 生成 CSV 文本
export function toCSV(results) {
  const header = [
    '排名',
    '代码',
    '名称',
    '细分类型',
    '类别',
    '综合得分',
    '最大回撤分',
    '回撤修复分',
    '年化收益分',
    '类型分',
    '杠杆率分',
    '规模分',
    '经理年限分',
    '费率分',
    '最大回撤%',
    '回撤修复天数',
    '3年年化%',
    '5年年化%',
    '杠杆率%(债券占净比)',
    '规模(亿)',
    '基金经理',
    '任职年限(年)',
    '综合费率%(年)',
    '成立日期',
    '同源份额',
  ];
  const rows = results.map((r) => {
    const pct = (x) => (x == null ? '' : (x * 100).toFixed(2));
    return [
      r.rank,
      r.code,
      r.name,
      r.type,
      r.category,
      r.composite == null ? '' : r.composite.toFixed(2),
      fmt(r.scores.maxDrawdown),
      fmt(r.scores.recoveryDays),
      fmt(r.scores.annualized),
      fmt(r.scores.type),
      fmt(r.scores.leverage),
      fmt(r.scores.size),
      fmt(r.scores.managerYears),
      fmt(r.scores.fee),
      pct(r.raw.mdd),
      r.raw.recoveryDays ?? '',
      pct(r.raw.annualized3),
      pct(r.raw.annualized5),
      r.raw.leverage == null ? '' : r.raw.leverage.toFixed(1),
      r.raw.size ?? '',
      r.raw.managerName || '',
      r.raw.managerYears == null ? '' : r.raw.managerYears.toFixed(2),
      r.raw.totalFee == null ? '' : r.raw.totalFee.toFixed(2),
      r.raw.establishDate || '',
      (r.raw.peers || []).map((p) => p.name).join('、'),
    ];
  });
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((row) => row.map(esc).join(',')).join('\n');
}

function fmt(x) {
  return x == null ? '' : x.toFixed(1);
}

// 排序取值：与前端列一致
function sortValue(r, key) {
  switch (key) {
    case 'name':
      return r.name;
    case 'category':
      return r.category;
    case 'composite':
      return r.composite ?? -Infinity;
    case 'rank':
      return r.rank;
    case 'establishDate':
      return (r.raw && r.raw.establishDate) || '';
    case 'size':
      return (r.raw && r.raw.size) ?? -Infinity;
    case 'managerYears':
      return (r.raw && r.raw.managerYears) ?? -Infinity;
    case 'fee':
      return (r.raw && r.raw.totalFee) ?? Infinity;
    default:
      return (r.scores && r.scores[key]) ?? -Infinity;
  }
}

// 在结果上做筛选 + 排序 + 分页，返回单页数据（避免整包返回）
export function queryResults(results, { sort = 'composite', dir = -1, filter = 'all', company = [], page = 1, pageSize = 50 } = {}) {
  let rows = results;
  if (filter && filter !== 'all') rows = rows.filter((r) => r.categoryKey === filter);
  if (company && company.length) {
    rows = rows.filter((r) => company.some((c) => (r.name || '').startsWith(c)));
  }
  const sorted = [...rows].sort((a, b) => {
    const av = sortValue(a, sort);
    const bv = sortValue(b, sort);
    if (av === bv) return 0;
    return av > bv ? dir : -dir;
  });
  const total = results.length;
  const filtered = sorted.length;
  const pages = Math.max(1, Math.ceil(filtered / pageSize));
  const cur = Math.min(Math.max(1, page), pages);
  const items = sorted.slice((cur - 1) * pageSize, cur * pageSize);
  return { total, filtered, items, page: cur, pageSize, pages };
}
