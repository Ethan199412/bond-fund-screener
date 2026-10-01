export default function ScorePill({ score }) {
  if (score == null) return <span className="muted">—</span>;
  const cls = score >= 80 ? 'high' : score >= 60 ? 'mid' : 'low';
  return <span className={`score-pill ${cls}`}>{score.toFixed(0)}</span>;
}
