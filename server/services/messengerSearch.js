const SNIPPET_RADIUS = 40;

const normalize = (value) => String(value || "").toLowerCase();

const matchAndSnippet = (text, query) => {
  const haystack = normalize(text);
  const needle = normalize(query);
  if (!needle || !haystack) return null;
  const idx = haystack.indexOf(needle);
  if (idx === -1) return null;
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + needle.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return {
    snippet: `${prefix}${text.slice(start, end)}${suffix}`,
    matchStart: idx - start + prefix.length,
    matchLength: needle.length,
  };
};

module.exports = { matchAndSnippet };
