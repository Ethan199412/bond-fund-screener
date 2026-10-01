// 前端展示配置：类别筛选 + 表格列定义

export const CATEGORIES = [
  ['all', '全部'],
  ['short', '中短债/短债'],
  ['pure', '普通纯债'],
  ['long', '长债'],
  ['index', '债券指数'],
  ['primary', '一级债'],
  ['secondary', '二级债'],
  ['hybridBond', '偏债混合'],
  ['convertible', '可转债'],
];

export const COLUMNS = [
  { key: 'rank', label: '排名', align: 'right' },
  { key: 'name', label: '基金', align: 'left' },
  { key: 'category', label: '类别', align: 'left' },
  { key: 'composite', label: '综合', align: 'right' },
  { key: 'maxDrawdown', label: '最大回撤', align: 'right' },
  { key: 'recoveryDays', label: '回撤修复', align: 'right' },
  { key: 'annualized', label: '年化收益', align: 'right' },
  { key: 'type', label: '类型', align: 'right' },
  { key: 'leverage', label: '杠杆率', align: 'right' },
  { key: 'size', label: '规模', align: 'right' },
  { key: 'managerYears', label: '经理年限', align: 'right' },
  { key: 'fee', label: '费率', align: 'right' },
  { key: 'establishDate', label: '成立日期', align: 'right' },
];
