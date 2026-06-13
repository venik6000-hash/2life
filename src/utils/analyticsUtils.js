import { DEFICIT_RULES } from "../data/deficitRules";
import { normalizeAnalyticsKey } from "../data/analyticsData";

const parseAnalyticsDate = (value) => {
  if (!value) return { y: 0, m: 0, d: 0, raw: "" };
  const s = String(value).trim();

  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return { d: +m[1], m: +m[2], y: +m[3], raw: s };

  m = s.match(/^(\d{1,2})\.(\d{4})$/);
  if (m) return { d: 0, m: +m[1], y: +m[2], raw: s };

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { d: +m[3], m: +m[2], y: +m[1], raw: s };

  return { y: 0, m: 0, d: 0, raw: s };
};

const sortAnalyticsDates = (dates) =>
  [...new Set(dates)].sort((a, b) => {
    const A = parseAnalyticsDate(a);
    const B = parseAnalyticsDate(b);
    if (A.y !== B.y) return A.y - B.y;
    if (A.m !== B.m) return A.m - B.m;
    if (A.d !== B.d) return A.d - B.d;
    return String(a).localeCompare(String(b));
  });

const toMetricNumber = (value) => {
  if (value == null || value === "") return null;
  const s = String(value).replace(/,/g, ".").trim();
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = +m[0];
  return Number.isFinite(n) ? n : null;
};

const parseOptimalRule = (raw) => {
  const s = String(raw || "")
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  if (!s || s === "-" || s === "—") return { type: "none" };

  let m = s.match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/);
  if (m) return { type: "range", min: +m[1], max: +m[2] };

  m = s.match(/^>=\s*(\d+(?:\.\d+)?)/);
  if (m) return { type: "gte", min: +m[1] };

  m = s.match(/^>\s*(\d+(?:\.\d+)?)/);
  if (m) return { type: "gt", min: +m[1] };

  m = s.match(/^<=\s*(\d+(?:\.\d+)?)/);
  if (m) return { type: "lte", max: +m[1] };

  m = s.match(/^<\s*(\d+(?:\.\d+)?)/);
  if (m) return { type: "lt", max: +m[1] };

  m = s.match(/^(от|не\s*менее)\s*(\d+(?:\.\d+)?)/);
  if (m) return { type: "gte", min: +m[2] };

  m = s.match(/^(выше|больше|более)\s*(\d+(?:\.\d+)?)/);
  if (m) return { type: "gt", min: +m[2] };

  m = s.match(/^(до|не\s*более)\s*(\d+(?:\.\d+)?)/);
  if (m) return { type: "lte", max: +m[2] };

  m = s.match(/^(менее|меньше|ниже)\s*(\d+(?:\.\d+)?)/);
  if (m) return { type: "lt", max: +m[2] };

  return { type: "none" };
};

const matchesOptimalRule = (value, rule) => {
  if (value == null || !rule || rule.type === "none") return false;
  switch (rule.type) {
    case "range":
      return value >= rule.min && value <= rule.max;
    case "gt":
      return value > rule.min;
    case "gte":
      return value >= rule.min;
    case "lt":
      return value < rule.max;
    case "lte":
      return value <= rule.max;
    default:
      return false;
  }
};

export const getMarkerStatus = (marker, rawValue) => {
  const value = toMetricNumber(rawValue);
  if (value == null) return "none";

  const refMin = toMetricNumber(marker?.refMin);
  const refMax = toMetricNumber(marker?.refMax);
  const hasRef = refMin != null && refMax != null && !(refMin === 0 && refMax === 0);

  if (hasRef) {
    if (value < refMin) return "lo";
    if (value > refMax) return "hi";
  }

  const optimalRule = parseOptimalRule(marker?.optimal);
  if (optimalRule.type !== "none") {
    return matchesOptimalRule(value, optimalRule) ? "ok" : "bd";
  }

  return "ok";
};

const getLatestAnalyticsDate = (cats=[]) => {
  const allD = sortAnalyticsDates(cats.flatMap(c=>c.markers.flatMap(m=>m.values.map(v=>v.date))));
  return allD[allD.length-1] || null;
};

export const getDisplayedAnalyticsDates = (cats=[]) =>
  sortAnalyticsDates(cats.flatMap(c=>c.markers.flatMap(m=>m.values.map(v=>v.date)))).reverse();

const normalizeMarkerKey = (categoryName, markerName) =>
  `${normalizeAnalyticsKey(categoryName)}::${normalizeAnalyticsKey(markerName)}`;

const lowByOptimalRule = (value, rule) => {
  if (value == null || !rule || rule.type === "none") return false;
  switch (rule.type) {
    case "range":
      return value < rule.min;
    case "gt":
      return value <= rule.min;
    case "gte":
      return value < rule.min;
    case "lt":
    case "lte":
      return false;
    default:
      return false;
  }
};

const getLowStatusForMarker = (marker, rawValue, triggerMode = "auto") => {
  const value = toMetricNumber(rawValue);
  if (value == null) return null;

  const refMin = toMetricNumber(marker?.refMin);
  const refMax = toMetricNumber(marker?.refMax);
  const hasRef = refMin != null && refMax != null && !(refMin === 0 && refMax === 0);
  const byRef = hasRef && value < refMin;

  const optimalRule = parseOptimalRule(marker?.optimal);
  const byOptimal = lowByOptimalRule(value, optimalRule);

  if (triggerMode === "ref") return byRef ? "lo" : null;
  if (triggerMode === "optimal") return byOptimal ? "bd" : null;

  if (hasRef) return byRef ? "lo" : null;
  return byOptimal ? "bd" : null;
};

const fallbackDeficitPresets = DEFICIT_RULES.map(rule => ({
  id: rule.id,
  label: rule.label,
  priority: rule.priority,
  markerRegex: rule.test.source,
  markerRegexFlags: rule.test.flags || "i",
  triggerMode: "auto"
}));

export const parseDeficitPresetPayload = (rawValue) => {
  if (rawValue && typeof rawValue === "object") return rawValue;
  if (typeof rawValue !== "string") return null;
  try {
    return JSON.parse(rawValue);
  } catch (_) {
    return null;
  }
};

export const serializeDeficitPresetPayload = (payload) => JSON.stringify(payload);

const normalizeDeficitPresets = (presets = []) => {
  if (!Array.isArray(presets) || presets.length === 0) return fallbackDeficitPresets;

  const prepared = presets.map((p, idx) => {
    const parsed = parseDeficitPresetPayload(p?.value ?? p);
    if (!parsed || !parsed.label) return null;
    return {
      id: parsed.id || p?.id || `preset-${idx}`,
      label: String(parsed.label || "").trim(),
      priority: Number.isFinite(+parsed.priority) ? +parsed.priority : Math.max(1, 100 - idx),
      markerKey: parsed.markerKey ? String(parsed.markerKey).trim().toLowerCase() : "",
      markerRegex: parsed.markerRegex ? String(parsed.markerRegex) : "",
      markerRegexFlags: parsed.markerRegexFlags ? String(parsed.markerRegexFlags) : "i",
      triggerMode: parsed.triggerMode === "ref" || parsed.triggerMode === "optimal" ? parsed.triggerMode : "auto"
    };
  }).filter(Boolean);

  return prepared.length ? prepared : fallbackDeficitPresets;
};

export const getAutoDeficitsFromAnalytics = (cats=[], selectedIds=[], presets=[]) => {
  const lastDate = getLatestAnalyticsDate(cats);
  if (!lastDate) return { lastDate:null, all:[], primary:[], selectedExtras:[], hidden:[] };

  const activePresets = normalizeDeficitPresets(presets);
  const found = [];
  const used = new Set();

  for (const rule of activePresets) {
    let matchedMarker = null;
    let matchedStatus = null;
    let matchedCategory = null;
    let markerRegex = null;
    if (rule.markerRegex) {
      try {
        markerRegex = new RegExp(rule.markerRegex, rule.markerRegexFlags || "i");
      } catch (_) {
        markerRegex = null;
      }
    }

    outer:
    for (const cat of cats) {
      for (const marker of (cat.markers || [])) {
        const markerKey = normalizeMarkerKey(cat.name, marker.name);
        if (rule.markerKey) {
          if (markerKey !== normalizeAnalyticsKey(rule.markerKey)) continue;
        } else if (markerRegex) {
          if (!markerRegex.test(String(marker.name || ""))) continue;
        } else {
          continue;
        }

        const valueObj = (marker.values || []).find(v => v.date === lastDate);
        if (!valueObj || valueObj.flagOff) continue;

        const status = getLowStatusForMarker(marker, valueObj.value, rule.triggerMode);
        if (status) {
          matchedMarker = marker;
          matchedCategory = cat;
          matchedStatus = status;
          break outer;
        }
      }
    }

    if (matchedMarker && !used.has(rule.id)) {
      used.add(rule.id);
      found.push({
        id: rule.id,
        label: rule.label,
        priority: (Number(rule.priority) || 50) + (matchedStatus === "lo" ? 10 : 0),
        markerName: matchedMarker.name,
        categoryName: matchedCategory?.name || "",
        markerKey: `${String(matchedCategory?.name||"").toLowerCase()}::${String(matchedMarker.name||"").toLowerCase()}`,
        status: matchedStatus,
        date: lastDate
      });
    }
  }

  found.sort((a,b)=>b.priority-a.priority || a.label.localeCompare(b.label));
  const primary = found.slice(0,4);
  const extraPool = found.slice(4);
  const selectedExtras = extraPool.filter(x=>selectedIds.includes(x.id));
  const hidden = extraPool.filter(x=>!selectedIds.includes(x.id));
  return { lastDate, all:found, primary, selectedExtras, hidden };
};
