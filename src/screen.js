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
import { LOOKBACK, DEFAULT_MAX_FUNDS } from './config.js';
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
