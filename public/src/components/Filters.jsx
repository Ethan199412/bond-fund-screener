import { CATEGORIES } from '../config.js';

export default function Filters({ filter, setFilter }) {
  return (
    <div className="filters">
      {CATEGORIES.map(([key, label]) => (
        <span
          key={key}
          className={`chip ${key === filter ? 'active' : ''}`}
          onClick={() => setFilter(key)}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
