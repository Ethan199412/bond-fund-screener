// 打分：把每个指标换算成 0-100 分，再按权重加权求和
import { WEIGHTS, SCORE, TYPE_PREFERENCE } from './config.js';

// 分段线性打分：points 按数值升序 [[value, score], ...]，端点外钳制、点间线性插值
export function piecewiseLinear(points, x) {
  if (x == null || Number.isNaN(x)) return null;
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

// metrics 字段: mdd, recoveryDays, annualized, categoryKey, size, managerYears, totalFee
export function scoreFund(metrics) {
  const s = {
    maxDrawdown: metrics.mdd != null ? piecewiseLinear(SCORE.maxDrawdown, metrics.mdd) : null,
    recoveryDays: metrics.recoveryDays != null ? piecewiseLinear(SCORE.recoveryDays, metrics.recoveryDays) : null,
    annualized: metrics.annualized != null ? piecewiseLinear(SCORE.annualized, metrics.annualized) : null,
    type: TYPE_PREFERENCE[metrics.categoryKey] ?? TYPE_PREFERENCE.other,
    leverage: metrics.leverage != null ? piecewiseLinear(SCORE.leverage, metrics.leverage) : null,
    size: metrics.size != null ? piecewiseLinear(SCORE.size, metrics.size) : null,
    managerYears: metrics.managerYears != null ? piecewiseLinear(SCORE.managerYears, metrics.managerYears) : null,
    fee: metrics.totalFee != null ? piecewiseLinear(SCORE.fee, metrics.totalFee) : null,
  };

  let weighted = 0;
  let weightSum = 0;
  for (const [key, w] of Object.entries(WEIGHTS)) {
    if (s[key] == null) continue; // 缺失指标跳过，权重重新归一
    weighted += s[key] * w;
    weightSum += w;
  }
  const composite = weightSum > 0 ? weighted / weightSum : null;
  return { scores: s, composite, weightSum, weighted };
}
