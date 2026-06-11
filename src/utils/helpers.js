export const calculateBmiValue = (heightCm, weightKg) => {
  const height = Number(String(heightCm ?? "").replace(",", "."));
  const weight = Number(String(weightKg ?? "").replace(",", "."));
  if (!Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) return null;
  const bmi = weight / ((height / 100) ** 2);
  return Number.isFinite(bmi) ? +bmi.toFixed(1) : null;
};

export const PRINT_DOCUMENT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:";

export const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const stripUnsafePrintMarkup = (html) => {
  if (typeof document === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content
    .querySelectorAll("script,iframe,object,embed,link,meta,base")
    .forEach((node) => node.remove());
  for (const element of template.content.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (["href", "src", "xlink:href", "formaction"].includes(name) && /^javascript:/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return template.innerHTML;
};

export const sanitizePrintHtml = (html) => {
  // Browsers serialize inline styles as rgb(), not hex — replace all vivid app colors with print-friendly equivalents
  const fixes = [
    // Dark mode backgrounds
    [/rgb\(6,\s*8,\s*14\)/g,'#f5f7fa'],[/rgb\(13,\s*16,\s*23\)/g,'#fff'],[/rgb\(24,\s*29,\s*40\)/g,'#f5f7fa'],[/rgb\(28,\s*34,\s*51\)/g,'#e8eaf0'],
    // Dark mode text
    [/rgb\(228,\s*232,\s*240\)/g,'#1a1f2e'],[/rgb\(125,\s*137,\s*161\)/g,'#6b7a99'],[/rgb\(78,\s*88,\s*109\)/g,'#9aa3b5'],
    // Accent green (dark #22c997 + light #0f9b73)
    [/rgb\(34,\s*201,\s*151\)/g,'#1a7a5e'],[/rgb\(15,\s*155,\s*115\)/g,'#1a7a5e'],
    // Red
    [/rgb\(239,\s*83,\s*80\)/g,'#c0392b'],[/rgb\(220,\s*38,\s*38\)/g,'#c0392b'],
    // Amber
    [/rgb\(255,\s*183,\s*77\)/g,'#b36a00'],[/rgb\(217,\s*119,\s*6\)/g,'#b36a00'],
    // Blue
    [/rgb\(66,\s*165,\s*245\)/g,'#1a56b0'],[/rgb\(37,\s*99,\s*235\)/g,'#1a56b0'],
    // Purple
    [/rgb\(167,\s*139,\s*250\)/g,'#6b4fa0'],[/rgb\(124,\s*58,\s*237\)/g,'#6b4fa0'],
    // rgba accent backgrounds → very subtle
    [/rgba\(34,\s*201,\s*151,[^)]+\)/g,'rgba(26,122,94,0.07)'],[/rgba\(15,\s*155,\s*115,[^)]+\)/g,'rgba(26,122,94,0.07)'],
    [/rgba\(239,\s*83,\s*80,[^)]+\)/g,'rgba(192,57,43,0.07)'],[/rgba\(220,\s*38,\s*38,[^)]+\)/g,'rgba(192,57,43,0.07)'],
    [/rgba\(255,\s*183,\s*77,[^)]+\)/g,'rgba(179,106,0,0.07)'],[/rgba\(217,\s*119,\s*6,[^)]+\)/g,'rgba(179,106,0,0.07)'],
    [/rgba\(66,\s*165,\s*245,[^)]+\)/g,'rgba(26,86,176,0.07)'],[/rgba\(37,\s*99,\s*235,[^)]+\)/g,'rgba(26,86,176,0.07)'],
    [/rgba\(167,\s*139,\s*250,[^)]+\)/g,'rgba(107,79,160,0.07)'],[/rgba\(124,\s*58,\s*237,[^)]+\)/g,'rgba(107,79,160,0.07)'],
    // Protocol slot head teal (#2d9c96)
    [/rgb\(45,\s*156,\s*150\)/g,'#1a7a5e'],
    // Protocol slot rail colors
    [/rgb\(214,\s*177,\s*85\)/g,'#b36a00'],[/rgb\(135,\s*176,\s*106\)/g,'#1a7a5e'],
    [/rgb\(219,\s*129,\s*128\)/g,'#c0392b'],[/rgb\(126,\s*161,\s*223\)/g,'#1a56b0'],
    // Protocol slot tint backgrounds → very light
    [/rgb\(233,\s*223,\s*181\)/g,'#fdf9f0'],[/rgb\(215,\s*229,\s*207\)/g,'#f0f7ee'],
    [/rgb\(239,\s*192,\s*191\)/g,'#fdf0f0'],[/rgb\(198,\s*215,\s*244\)/g,'#f0f4fd'],
    // Custom slot colors → green
    [/rgb\(160,\s*110,\s*232\)/g,'#6b4fa0'],[/rgb\(232,\s*144,\s*110\)/g,'#b36a00'],
    [/rgb\(45,\s*184,\s*160\)/g,'#1a7a5e'],[/rgb\(200,\s*125,\s*212\)/g,'#6b4fa0'],
    [/rgb\(232,\s*201,\s*110\)/g,'#b36a00'],
    // Hex fallback (in case browser keeps hex)
    [/#22c997/g,'#1a7a5e'],[/#0f9b73/g,'#1a7a5e'],[/#ef5350/g,'#c0392b'],[/#dc2626/g,'#c0392b'],
    [/#ffb74d/g,'#b36a00'],[/#d97706/g,'#b36a00'],[/#42a5f5/g,'#1a56b0'],[/#2563eb/g,'#1a56b0'],
    [/#a78bfa/g,'#6b4fa0'],[/#7c3aed/g,'#6b4fa0'],[/#06080e/g,'#f5f7fa'],[/#0d1017/g,'#fff'],
    [/#181d28/g,'#f5f7fa'],[/#1c2233/g,'#e8eaf0'],[/#e4e8f0/g,'#1a1f2e'],[/#7d89a1/g,'#6b7a99'],
    [/#2d9c96/g,'#1a7a5e'],[/#d6b155/g,'#b36a00'],[/#87b06a/g,'#1a7a5e'],[/#db8180/g,'#c0392b'],
    [/#7ea1df/g,'#1a56b0'],[/#a06ee8/g,'#6b4fa0'],[/#e8906e/g,'#b36a00'],[/#2db8a0/g,'#1a7a5e'],
    [/#c87dd4/g,'#6b4fa0'],[/#e8c96e/g,'#b36a00'],
    // Remove box-shadows
    [/box-shadow:[^;}"]+/g,'box-shadow:none'],
  ];
  const safeHtml = stripUnsafePrintMarkup(String(html || ""));
  return fixes.reduce((h,[from,to])=>h.replace(from,to), safeHtml);
};
