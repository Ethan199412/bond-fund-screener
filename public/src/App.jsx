import { useEffect, useRef, useState } from 'react';
import Controls from './components/Controls.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import Filters from './components/Filters.jsx';
import FundTable from './components/FundTable.jsx';
import { startScreen, getJob } from './api.js';

export default function App() {
  const [funds, setFunds] = useState('');
  const [maxFunds, setMaxFunds] = useState('200');
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null });
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'composite', dir: -1 });
  const [jobId, setJobId] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const run = async () => {
    clearInterval(timerRef.current);
    setStatus('running');
    setError('');
    setResults([]);
    setProgress({ done: 0, total: 0, current: null });
    try {
      const { jobId } = await startScreen({ funds: funds.trim(), maxFunds: maxFunds || '200' });
      setJobId(jobId);
      timerRef.current = setInterval(async () => {
        try {
          const job = await getJob(jobId);
          if (job.status === 'running') {
            setProgress(job.progress || {});
          } else if (job.status === 'done') {
            clearInterval(timerRef.current);
            setResults(job.results || []);
            setTotal(job.total);
            setStatus('done');
          } else if (job.status === 'error') {
            clearInterval(timerRef.current);
            setError(job.error || '未知错误');
            setStatus('error');
          }
        } catch {
          /* 网络抖动，忽略 */
        }
      }, 800);
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  };

  const exportUrl = (ext) => (jobId ? `/api/job/${jobId}/${ext}` : '#');
  const shownCount = results.filter((r) => filter === 'all' || r.categoryKey === filter).length;

  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <h1>债券基金筛选器</h1>
          <p className="sub">基于天天基金公开数据，按 8 个指标加权打分筛选优秀债券基金</p>
        </div>
      </header>

      <main className="wrap">
        <Controls
          funds={funds}
          setFunds={setFunds}
          maxFunds={maxFunds}
          setMaxFunds={setMaxFunds}
          onRun={run}
          running={status === 'running'}
          canExport={status === 'done'}
          onExportCsv={() => window.open(exportUrl('csv'))}
          onExportJson={() => window.open(exportUrl('json'))}
        />

        {status === 'running' && <ProgressBar progress={progress} />}

        {status === 'error' && (
          <section className="summary">
            <b style={{ color: 'var(--bad)' }}>出错：{error}</b>
          </section>
        )}

        {status === 'done' && (
          <>
            <section className="summary">
              共评估 <b>{total}</b> 只债券基金，成功 <b>{results.length}</b> 只，按综合得分降序排列。
            </section>
            <section className="card">
              <div className="toolbar">
                <Filters filter={filter} setFilter={setFilter} />
                <div className="count">
                  显示 {shownCount} / {results.length} 只
                </div>
              </div>
              <FundTable results={results} filter={filter} sort={sort} setSort={setSort} />
            </section>
          </>
        )}
      </main>

      <footer className="wrap foot">
        数据来源：天天基金网（东方财富）公开接口。结果仅供研究参考，不构成投资建议。
      </footer>
    </>
  );
}
