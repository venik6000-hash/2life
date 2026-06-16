// Pure presentation math. No React, no DOM. `value` is the per-day momentum (subjective) OR any metric.
export const METRIC_LABELS = { energy: "Энергия", sleep: "Сон", mood: "Настроение", focus: "Фокус", calm: "Спокойствие" };
const round1 = (n) => Math.round(n * 10) / 10;

export function toPolylinePoints(series, { width = 300, height = 120, pad = 10, minScore = 1, maxScore = 5 } = {}) {
  const pts = (series || []).filter((d) => Number.isFinite(Number(d.value)));
  if (!pts.length) return "";
  const span = (maxScore - minScore) || 1;
  const innerW = width - pad * 2, innerH = height - pad * 2, n = pts.length;
  return pts.map((d, i) => {
    const x = n === 1 ? pad : pad + (innerW * i) / (n - 1);
    const norm = (Number(d.value) - minScore) / span;
    const y = pad + innerH * (1 - Math.max(0, Math.min(1, norm)));
    return `${round1(x)},${round1(y)}`;
  }).join(" ");
}

export function deltaVsFirstWeek(series) {
  const pts = (series || []).filter((d) => d && d.scores);
  if (!pts.length) return [];
  const first = pts.slice(0, 7), last = pts.slice(-7);
  const avg = (arr, key) => { const v = arr.map((d) => Number(d.scores?.[key])).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  return Object.keys(METRIC_LABELS).map((key) => {
    const a = avg(first, key), b = avg(last, key);
    return { key, label: METRIC_LABELS[key], delta: a == null || b == null ? 0 : round1(b - a) };
  });
}
