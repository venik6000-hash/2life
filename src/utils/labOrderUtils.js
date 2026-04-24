import { ANALYTICS_GROUP_TEMPLATES, LAB_SIMPLE_GROUP_KEYS, normalizeAnalyticsKey } from "../data/analyticsData";

const uniq = (arr = []) => {
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    const v = String(raw || "").replace(/\s+/g, " ").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
};

export const parseLabOrderMarkersText = (rawText = "") =>
  uniq(String(rawText || "").split(/\r?\n/).map(x => x.trim()));

export const markersToLabOrderText = (markers = []) => uniq(markers).join("\n");

export const parseLabOrderItemPayload = (rawValue) => {
  let parsed = null;
  if (rawValue && typeof rawValue === "object") parsed = rawValue;
  else if (typeof rawValue === "string") {
    try { parsed = JSON.parse(rawValue); } catch (_) { parsed = null; }
  }

  if (parsed && typeof parsed === "object") {
    const name = String(parsed.name || parsed.groupName || parsed.title || "").trim();
    const markers = uniq(Array.isArray(parsed.markers) ? parsed.markers : []);
    const simple = !!parsed.simple;
    if (!name) return null;
    return { name, markers, simple };
  }

  const legacy = String(rawValue || "").trim();
  if (!legacy) return null;
  return { name: legacy, markers: [], simple: true };
};

export const serializeLabOrderItemPayload = (payload = {}) =>
  JSON.stringify({
    name: String(payload.name || "").trim(),
    markers: uniq(Array.isArray(payload.markers) ? payload.markers : []),
    simple: !!payload.simple
  });

export const buildDefaultLabOrderTemplates = () =>
  ANALYTICS_GROUP_TEMPLATES.map((group, idx) => ({
    id: `fallback-${idx + 1}`,
    name: String(group.name || "").trim(),
    markers: uniq(group.markers || []),
    simple: LAB_SIMPLE_GROUP_KEYS.has(normalizeAnalyticsKey(group.name || ""))
  }));

export const normalizeLabOrderTemplates = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return buildDefaultLabOrderTemplates();
  const mapped = items.map((item, idx) => {
    const parsed = parseLabOrderItemPayload(item?.value ?? item);
    if (!parsed) return null;
    return {
      id: item?.id || `lab-${idx + 1}`,
      name: parsed.name,
      markers: uniq(parsed.markers || []),
      simple: !!parsed.simple
    };
  }).filter(Boolean);

  return mapped.length ? mapped : buildDefaultLabOrderTemplates();
};

export const calcLabOrderClientAge = (dob) => {
  if (!dob) return null;
  const value = String(dob).trim();
  let day, month, year;
  const ru = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ru) { day = +ru[1]; month = +ru[2] - 1; year = +ru[3]; }
  else if (iso) { day = +iso[3]; month = +iso[2] - 1; year = +iso[1]; }
  else return null;

  const now = new Date();
  let age = now.getFullYear() - year;
  if (now < new Date(now.getFullYear(), month, day)) age--;
  return age;
};

export const getSelectedLabOrderItems = (groups = [], selection = {}) => {
  const items = [];
  for (const group of groups) {
    const selected = selection[group.name] || [];
    if (!selected.length) continue;
    if (group.simple) items.push(group.name);
    else items.push(...selected);
  }
  return items;
};

export const buildLabOrderPrintDocument = ({ clientName, clientDob, date, items }) => {
  const age = calcLabOrderClientAge(clientDob);
  const ageStr = age != null ? `${age} лет` : "—";
  const half = Math.ceil(items.length / 2);
  const makeCol = (arr, start) => `<ol>${arr.map((marker, index) => `<li><span class="n">${start + index + 1}.</span><span class="t">${marker}</span></li>`).join("")}</ol>`;
  const listHtml = `<div class="cols"><div class="col">${makeCol(items.slice(0, half), 0)}</div><div class="col">${makeCol(items.slice(half), half)}</div></div>`;
  const css = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',-apple-system,Arial,sans-serif;background:#fff;color:#1a1f2e;font-size:13px;line-height:1.6}@page{margin:0;size:A4 portrait}.page{padding:14mm 18mm}.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid #e8eaf0}.title{font-size:19px;font-weight:700;color:#1a1f2e;letter-spacing:-.3px;margin-bottom:5px}.mr{font-size:12px;color:#6b7a99;margin-top:2px}.cl-name{font-size:13px;font-weight:700;color:#1a1f2e;margin-top:4px}.meta{text-align:right;font-size:12px;color:#6b7a99;line-height:1.9}.badge{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#6b7a99;border:1px solid #e8eaf0;padding:3px 10px;border-radius:4px;margin-bottom:8px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:flex-start}.col{}ol{list-style:none;padding:0;margin:0}ol li{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f0f2f6;align-items:baseline;page-break-inside:avoid;break-inside:avoid}.n{font-size:10px;font-weight:600;color:#6b7a99;min-width:18px;flex-shrink:0}.t{font-size:12px;color:#1a1f2e;line-height:1.35}.ftr{margin-top:18px;padding-top:10px;border-top:1px solid #e8eaf0;display:flex;justify-content:space-between;font-size:10px;color:#6b7a99;letter-spacing:.3px}`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Направление — ${clientName}</title><style>${css}</style></head><body><div class="page"><div class="hdr"><div><div class="title">Направление на анализы</div><div class="cl-name">${clientName}</div><div class="mr">Возраст: ${ageStr}</div></div><div class="meta"><div class="badge">Лаборатория</div><div>${date}</div></div></div>${listHtml}<div class="ftr"><span>Направление на анализы</span><span>${clientName} · ${date}</span></div></div></body></html>`;
};
