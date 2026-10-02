export default function Pagination({ page, pages, filtered, onPage }) {
  if (filtered === 0) return null;
  return (
    <div className="pagination">
      <button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        上一页
      </button>
      <span className="page-info">
        第 {page} / {pages} 页 · 共 {filtered} 只
      </span>
      <button className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        下一页
      </button>
    </div>
  );
}
