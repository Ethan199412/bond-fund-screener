import { COLUMNS } from '../config.js';
import ScorePill from './ScorePill.jsx';

function pct(x) {
  return x == null ? '—' : (x * 100).toFixed(2) + '%';
}
function num(x, d = 2) {
  return x == null ? '—' : Number(x).toFixed(d);
}

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
      return r.raw?.establishDate || '';
    case 'size':
      return r.raw?.size ?? -Infinity;
    case 'managerYears':
      return r.raw?.managerYears ?? -Infinity;
    case 'fee':
      return r.raw?.totalFee ?? Infinity;
    default:
      return r.scores?.[key] ?? -Infinity;
  }
}

function Cell({ r, col }) {
  const raw = r.raw || {};
  switch (col.key) {
    case 'rank':
      return r.rank;
    case 'name':
      return (
        <>
          <div className="fund-name">{r.name}</div>
          <div className="fund-code">{r.code}</div>
        </>
      );
    case 'category':
      return <span className={`badge ${r.categoryKey}`}>{r.category}</span>;
    case 'composite':
      return <ScorePill score={r.composite} />;
    case 'maxDrawdown':
      return (
        <>
          <ScorePill score={r.scores.maxDrawdown} />
          <div className="raw-sm">{pct(raw.mdd)}</div>
        </>
      );
    case 'recoveryDays':
      return (
        <>
          <ScorePill score={r.scores.recoveryDays} />
          <div className="raw-sm">{raw.recoveryDays == null ? '—' : raw.recoveryDays + ' 天'}</div>
        </>
      );
    case 'annualized':
      return (
        <>
          <ScorePill score={r.scores.annualized} />
          <div className="raw-sm">{pct(raw.annualized3)}</div>
        </>
      );
    case 'type':
      return <ScorePill score={r.scores.type} />;
    case 'leverage':
      return (
        <>
          <ScorePill score={r.scores.leverage} />
          <div className="raw-sm">{raw.leverage == null ? '—' : raw.leverage.toFixed(0) + '%'}</div>
        </>
      );
    case 'size':
      return (
        <>
          <ScorePill score={r.scores.size} />
          <div className="raw-sm">{raw.size == null ? '—' : raw.size + ' 亿'}</div>
        </>
      );
    case 'managerYears':
      return (
        <>
          <ScorePill score={r.scores.managerYears} />
          <div className="raw-sm">{raw.managerYears == null ? '—' : num(raw.managerYears, 1) + ' 年'}</div>
        </>
      );
    case 'fee':
      return (
        <>
          <ScorePill score={r.scores.fee} />
          <div className="raw-sm">{raw.totalFee == null ? '—' : raw.totalFee.toFixed(2) + '%'}</div>
        </>
      );
    case 'establishDate':
      return raw.establishDate || '—';
    default:
      return '';
  }
}

export default function FundTable({ results, filter, sort, setSort }) {
  const rows = results
    .filter((r) => filter === 'all' || r.categoryKey === filter)
    .sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av === bv) return 0;
      return av > bv ? sort.dir : -sort.dir;
    });

  const onSort = (key) => {
    if (sort.key === key) setSort({ key, dir: -sort.dir });
    else setSort({ key, dir: key === 'name' || key === 'category' ? 1 : -1 });
  };

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.key} className={col.align} onClick={() => onSort(col.key)}>
                {col.label}
                {sort.key === col.key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              {COLUMNS.map((col) => (
                <td key={col.key} className={col.align === 'left' ? 'left' : ''}>
                  <Cell r={r} col={col} />
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="left muted" style={{ padding: '24px' }}>
                暂无结果
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
