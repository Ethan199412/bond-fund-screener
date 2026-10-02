import { useEffect, useRef, useState } from 'react';
import Controls from './components/Controls.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import Filters from './components/Filters.jsx';
import FundTable from './components/FundTable.jsx';
import Pagination from './components/Pagination.jsx';
import { startScreen, getJob, getLatest, fetchLatestResults } from './api.js';

const PAGE_SIZE = 50;

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function App() {
  const [funds, setFunds] = useState('');
  const [maxFunds, setMaxFunds] = useState('200');
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0, current: null });
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(null);

  // 分页 / 排序 / 筛选状态（结果落盘在后端，前端只持当前页）
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [evaluated, setEvaluated] = useState(0);
  const [succeeded, setSucceeded] = useState(0);
  const [filtered, setFiltered] = useState(0);
  const [sort, setSort] = useState({ key: 'composite', dir: -1 });
  const [filter, setFilter] = useState('all');
  const [companies, setCompanies] = useState([]);

  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const loadPage = async (p, s, f, comps = []) => {
    const params = new URLSearchParams({
      page: p,
      pageSize: PAGE_SIZE,
      sort: s.key,
      dir: s.dir === -1 ? 'desc' : 'asc',
      filter: f,
    });
    if (comps.length) params.set('company', comps.join(','));
    const data = await fetchLatestResults(params);
    setItems(data.items || []);
    setPage(data.page || 1);
    setPages(data.pages || 1);
    setFiltered(data.filtered || 0);
  };

  // 打开页面即加载上次结果，秒出；无需重新跑筛选
  useEffect(() => {
    (async () => {
      try {
        const latest = await getLatest();
        if (latest.exists) {
          setEvaluated(latest.total);
          setSucceeded(latest.count);
          setSavedAt(latest.savedAt);
          setStatus('done');
          try {
            await loadPage(1, sort, filter);
          } catch (e) {
            setError('加载结果失败：' + (e.message || e));
          }
        }
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async () => {
    clearInterval(timerRef.current);
    setStatus('running');
    setError('');
    setItems([]);
    setProgress({ done: 0, total: 0, current: null });
    try {
      const { jobId } = await startScreen({ funds: funds.trim(), maxFunds: maxFunds || '200' });
      timerRef.current = setInterval(async () => {
        try {
          const job = await getJob(jobId);
          if (job.status === 'running') {
            setProgress(job.progress || {});
          } else if (job.status === 'done') {
            clearInterval(timerRef.current);
            setEvaluated(job.total);
            setSucceeded(job.count);
            setSavedAt(new Date().toISOString());
            setStatus('done');
            try {
              await loadPage(1, sort, filter, companies);
            } catch (e) {
              setError('加载结果失败：' + (e.message || e));
            }
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

  const onSort = (key) => {
    const next =
      sort.key === key
        ? { key, dir: -sort.dir }
        : { key, dir: key === 'name' || key === 'category' ? 1 : -1 };
    setSort(next);
    if (status === 'done') loadPage(1, next, filter, companies);
  };

  const onFilter = (k) => {
    setFilter(k);
    if (status === 'done') loadPage(1, sort, k, companies);
  };

  const onPage = (p) => {
    if (status === 'done') loadPage(p, sort, filter, companies);
  };

  const toggleCompany = (c) => {
    const next = companies.includes(c) ? companies.filter((x) => x !== c) : [...companies, c];
    setCompanies(next);
    if (status === 'done') loadPage(1, sort, filter, next);
  };

  const clearCompanies = () => {
    setCompanies([]);
    if (status === 'done') loadPage(1, sort, filter, []);
  };

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
          onExportCsv={() => window.open('/api/latest/csv')}
          onExportJson={() => window.open('/api/latest/json')}
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
              共评估 <b>{evaluated}</b> 只，成功 <b>{succeeded}</b> 只，按综合得分降序排列。
              {savedAt && (
                <span style={{ marginLeft: 12 }}>数据截至 {fmtTime(savedAt)}</span>
              )}
            </section>
            <section className="card">
              <div className="toolbar">
                <Filters
                  filter={filter}
                  onFilter={onFilter}
                  companies={companies}
                  onToggleCompany={toggleCompany}
                  onClearCompanies={clearCompanies}
                />
                <div className="count">当前筛选 {filtered} 只</div>
              </div>
              <FundTable items={items} sort={sort} onSort={onSort} />
              <Pagination page={page} pages={pages} filtered={filtered} onPage={onPage} />
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
