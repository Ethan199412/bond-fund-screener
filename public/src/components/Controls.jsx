export default function Controls({
  funds,
  setFunds,
  maxFunds,
  setMaxFunds,
  onRun,
  running,
  canExport,
  onExportCsv,
  onExportJson,
}) {
  return (
    <section className="controls card">
      <div className="field">
        <label htmlFor="funds">指定基金代码（可选，逗号分隔，留空则按债券基金全量）</label>
        <input
          id="funds"
          type="text"
          value={funds}
          onChange={(e) => setFunds(e.target.value)}
          placeholder="例如：000032,110027"
          onKeyDown={(e) => e.key === 'Enter' && !running && onRun()}
        />
      </div>
      <div className="field field-sm">
        <label htmlFor="maxFunds">候选数量上限</label>
        <input
          id="maxFunds"
          type="number"
          value={maxFunds}
          min="0"
          step="10"
          onChange={(e) => setMaxFunds(e.target.value)}
        />
        <span className="hint">0 = 不限（全量较慢）</span>
      </div>
      <div className="field field-sm">
        <label>&nbsp;</label>
        <button className="btn primary" onClick={onRun} disabled={running}>
          {running ? '筛选中…' : '开始筛选'}
        </button>
      </div>
      <div className="field field-sm">
        <label>&nbsp;</label>
        <button className="btn" onClick={onExportCsv} disabled={!canExport}>
          导出 CSV
        </button>
        <button className="btn" onClick={onExportJson} disabled={!canExport}>
          导出 JSON
        </button>
      </div>
    </section>
  );
}
