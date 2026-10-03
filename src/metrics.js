// 净值类指标计算：年化收益、最大回撤、回撤修复时间
// 输入统一为累计净值序列：[[毫秒时间戳, 净值], ...]，按时间升序。

function sliceLookback(navSeries, days) {
  if (!navSeries || !navSeries.length) return [];
  const lastT = navSeries[navSeries.length - 1][0];
  const cutoff = lastT - days * 86400000;
  return navSeries.filter((p) => p[0] >= cutoff);
}

// 年化收益（复利）：取距今 years 年附近的净值起点，按实际天数折算
export function computeAnnualized(navSeries, years) {
  if (!navSeries || navSeries.length < 2) return null;
  const last = navSeries[navSeries.length - 1];
  const lastT = last[0];
  const lastV = last[1];
  const targetT = lastT - years * 365.25 * 86400000;
  let idx = navSeries.findIndex((p) => p[0] >= targetT);
  if (idx < 0) return null; // 历史不足
  const startV = navSeries[idx][1];
  const startT = navSeries[idx][0];
  const days = (lastT - startT) / 86400000;
  if (days <= 0 || startV <= 0 || lastV <= 0) return null;
  return Math.pow(lastV / startV, 365.25 / days) - 1;
}

// 最大回撤：回看窗口内的峰值→谷值最大跌幅
export function computeMaxDrawdown(navSeries, lookbackDays) {
  const pts = sliceLookback(navSeries, lookbackDays);
  if (pts.length < 2) return null;
  let curPeak = pts[0][1];
  let curPeakT = pts[0][0];
  let maxDD = 0;
  let ddPeakV = pts[0][1];
  let ddPeakT = pts[0][0];
  let ddTroughV = pts[0][1];
  let ddTroughT = pts[0][0];
  for (const [t, v] of pts) {
    if (v > curPeak) {
      curPeak = v;
      curPeakT = t;
    }
    const dd = (curPeak - v) / curPeak;
    if (dd > maxDD) {
      maxDD = dd;
      ddPeakV = curPeak;
      ddPeakT = curPeakT;
      ddTroughV = v;
      ddTroughT = t;
    }
  }
  return {
    mdd: maxDD,
    peakDate: ddPeakT,
    troughDate: ddTroughT,
    peakValue: ddPeakV,
    troughValue: ddTroughV,
  };
}

// 回撤修复时间：所有“已完全修复”的回撤中，从底部回到前高所需的最长天数
export function computeRecoveryDays(navSeries, lookbackDays) {
  const pts = sliceLookback(navSeries, lookbackDays);
  if (pts.length < 2) return null;
  let peakV = pts[0][1];
  let troughV = pts[0][1];
  let troughT = pts[0][0];
  let inDD = false;
  let maxDays = 0;
  let best = null;
  for (const [t, v] of pts) {
    if (v >= peakV - 1e-9) {
      if (inDD) {
        const recDays = Math.round((t - troughT) / 86400000); // 毫秒 → 天
        if (recDays > maxDays) {
          maxDays = recDays;
          best = { troughDate: troughT, recoverDate: t, days: recDays };
        }
        inDD = false;
      }
      peakV = v;
    } else {
      if (!inDD) {
        inDD = true;
        troughV = v;
        troughT = t;
      } else if (v < troughV) {
        troughV = v;
        troughT = t;
      }
    }
  }
  return best ? { days: best.days, troughDate: best.troughDate, recoverDate: best.recoverDate } : { days: 0 };
}

// 年化夏普比率：近 lookbackDays 的累计净值日收益率，(年化收益 − 无风险利率) ÷ 年化波动率
// 年化用 252 个交易日；波动率接近 0 或样本不足时返回 null（不打分）
export function computeSharpe(navSeries, lookbackDays, riskFreeRate = 0.02) {
  const pts = sliceLookback(navSeries, lookbackDays);
  if (pts.length < 30) return null;
  const returns = [];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1][1];
    const cur = pts[i][1];
    if (prev > 0 && cur > 0) returns.push(cur / prev - 1);
  }
  if (returns.length < 20) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) * (b - mean), 0) / returns.length;
  const sd = Math.sqrt(variance);
  if (sd < 1e-6) return null;
  const annReturn = mean * 252;
  const annVol = sd * Math.sqrt(252);
  return (annReturn - riskFreeRate) / annVol;
}

// 经理任职年限字符串 → 年（如 "13年又19天"）
export function parseManagerYears(workTime) {
  if (!workTime) return null;
  let m = workTime.match(/(\d+)年又(\d+)天/);
  if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / 365;
  m = workTime.match(/(\d+)年/);
  if (m) return parseInt(m[1], 10);
  m = workTime.match(/(\d+)天/);
  if (m) return parseInt(m[1], 10) / 365;
  return null;
}
