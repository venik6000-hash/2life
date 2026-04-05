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
