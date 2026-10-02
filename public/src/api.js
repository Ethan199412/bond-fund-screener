// 后端 API 封装

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function startScreen({ funds, maxFunds }) {
  const q = new URLSearchParams({ maxFunds });
  if (funds) q.set('funds', funds);
  const res = await fetch('/api/screen?' + q.toString());
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function getJob(jobId) {
  const res = await fetch('/api/job/' + jobId);
  return res.json();
}

export async function fetchResults(jobId, params) {
  const res = await fetch(`/api/job/${jobId}/results?` + params.toString());
  return res.json();
}

export async function getLatest() {
  return fetchJson('/api/latest');
}

export async function fetchLatestResults(params) {
  return fetchJson('/api/latest/results?' + params.toString());
}
