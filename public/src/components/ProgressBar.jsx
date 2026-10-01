export default function ProgressBar({ progress }) {
  const { done, total, current } = progress || {};
  const p = total ? Math.round((done / total) * 100) : 2;
  return (
    <section className="card progress">
      <div className="progress-text">
        {total ? `筛选中 ${done}/${total}（当前 ${current}）` : '获取基金列表…'}
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: p + '%' }} />
      </div>
    </section>
  );
}
