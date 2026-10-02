import { CATEGORIES, COMPANIES } from '../config.js';

export default function Filters({ filter, onFilter, companies, onToggleCompany, onClearCompanies }) {
  return (
    <div className="filters">
      <span className="filter-label">类型</span>
      {CATEGORIES.map(([key, label]) => (
        <span
          key={key}
          className={`chip ${key === filter ? 'active' : ''}`}
          onClick={() => onFilter(key)}
        >
          {label}
        </span>
      ))}

      <span className="filter-label">公司</span>
      {COMPANIES.map((c) => (
        <span
          key={c.label}
          className={`chip ${companies.includes(c.match) ? 'active' : ''}`}
          onClick={() => onToggleCompany(c.match)}
        >
          {c.label}
        </span>
      ))}
      {companies.length > 0 && (
        <span className="chip chip-clear" onClick={onClearCompanies}>
          清空
        </span>
      )}
    </div>
  );
}
