// 前端展示配置：类别筛选 + 表格列定义

// 与后端 src/config.js 的 INCLUDE_CATEGORIES 白名单保持一致（预筛后只可能剩这些类别）
export const CATEGORIES = [
  ['all', '全部'],
  ['short', '中短债/短债'],
  ['pure', '普通纯债'],
  ['long', '长债'],
  ['index', '债券指数'],
];

// 常见基金公司（用于公司多选筛选）。match 为匹配前缀（基金名称以它开头），label 为显示名。
// 注意：工银瑞信旗下基金在天天基金多以「工银」开头，故 match 用「工银」。
export const COMPANIES = [
  { label: '易方达', match: '易方达' },
  { label: '富国', match: '富国' },
  { label: '招商', match: '招商' },
  { label: '博时', match: '博时' },
  { label: '南方', match: '南方' },
  { label: '广发', match: '广发' },
  { label: '鹏华', match: '鹏华' },
  { label: '汇添富', match: '汇添富' },
  { label: '工银瑞信', match: '工银' },
  { label: '华夏', match: '华夏' },
];

// width 为固定列宽（px），配合 table-layout:fixed 使用；desc 非空时表头显示「?」说明
export const COLUMNS = [
  { key: 'rank', label: '排名', align: 'right', width: 64 },
  { key: 'name', label: '基金', align: 'left', width: 250 },
  { key: 'category', label: '类别', align: 'left', width: 108 },
  {
    key: 'composite',
    label: '综合',
    align: 'right',
    width: 92,
    desc: '按 8 个指标加权求和：最大回撤/回撤修复/年化/类型各 5 分，杠杆 4 分，规模/经理年限/费率各 3 分；缺失指标自动剔除后重新归一，满分 100。',
  },
  {
    key: 'maxDrawdown',
    label: '最大回撤',
    align: 'right',
    width: 118,
    desc: '近 3 年累计净值「峰值→谷值」的最大跌幅，越小越好。理想 ≤0.5%，可接受 0.5%~1%，>1% 需谨慎。',
  },
  {
    key: 'recoveryDays',
    label: '回撤修复',
    align: 'right',
    width: 118,
    desc: '近 3 年内已完全修复的回撤中，从底部回到前高所需的最长天数。理想 ≤3 个月，可接受 3~6 个月，>6 个月需谨慎。',
  },
  {
    key: 'annualized',
    label: '年化收益',
    align: 'right',
    width: 118,
    desc: '近 3 年年化复利收益（历史不足 3 年则退回 5 年）。理想 ≥3.5%，可接受 3.0%~3.5%，<3% 需谨慎。',
  },
  {
    key: 'type',
    label: '类型',
    align: 'right',
    width: 92,
    desc: '按基金细分类型给的稳健偏好分：中短债/短债(100) > 普通纯债(85) > 长债(60)，其余债类按风险递减。',
  },
  {
    key: 'leverage',
    label: '杠杆率',
    align: 'right',
    width: 112,
    desc: '用「债券占净比」近似杠杆率（季报披露、会滞后一两个季度）。>100% 即加杠杆。理想 ≤120%，可接受 120%~130%。',
  },
  {
    key: 'size',
    label: '规模',
    align: 'right',
    width: 108,
    desc: '基金净资产规模（亿元）。理想 10~100 亿，可接受 5~200 亿，<1 亿有清盘风险。',
  },
  {
    key: 'managerYears',
    label: '经理年限',
    align: 'right',
    width: 112,
    desc: '现任基金经理累计任职年限（来自天天基金 workTime 字段）。理想 ≥3 年，可接受 1~3 年，<1 年需谨慎。',
  },
  {
    key: 'fee',
    label: '费率',
    align: 'right',
    width: 112,
    desc: '综合费率 = 管理费 + 托管费 + 销售服务费（%/年）。理想 ≤0.5%，可接受 0.5%~0.8%，>0.8% 需谨慎。',
  },
  { key: 'establishDate', label: '成立日期', align: 'right', width: 112 },
];
