// 命令行模式：跑一次筛选并导出 CSV / JSON
// 用法：
//   node cli.js                     # 默认筛选前 200 只债券基金
//   node cli.js --funds 000032,110027
//   node cli.js --max 500
//   node cli.js --max 0            # 0 = 全量债券基金（耗时较长）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScreen, toCSV } from './src/screen.js';
import { DEFAULT_MAX_FUNDS, DIRS } from './src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = { funds: null, maxFunds: DEFAULT_MAX_FUNDS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--funds' && argv[i + 1]) o.funds = argv[++i];
    else if (a === '--max' && argv[i + 1]) o.maxFunds = parseInt(argv[++i], 10) || 0;
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.funds) {
  opts.funds = opts.funds.split(/[,，\s]+/).filter(Boolean);
}

const t0 = Date.now();
console.log('开始筛选…' + (opts.funds ? `指定基金 ${opts.funds.length} 只` : `债券基金前 ${opts.maxFunds} 只`));

const { total, results } = await runScreen({
  funds: opts.funds,
  maxFunds: opts.maxFunds,
  onProgress: (p) => {
    process.stdout.write(`\r进度 ${p.done}/${p.total}（当前 ${p.current}）`);
  },
});

const outDir = path.join(__dirname, DIRS.output);
fs.mkdirSync(outDir, { recursive: true });
const csvPath = path.join(outDir, 'output.csv');
const jsonPath = path.join(outDir, 'output.json');
fs.writeFileSync(csvPath, '﻿' + toCSV(results), 'utf8');
fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf8');

console.log(`\n完成：共评估 ${total} 只，成功 ${results.length} 只，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`结果已导出：${csvPath}\n          ${jsonPath}`);
