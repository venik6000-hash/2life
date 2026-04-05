const XLSX = require('xlsx');

const detectAnalyticsSheet = (wb) => {
  let best = null;

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });

    let dateRowScore = 0;
    let markerHints = 0;

    for (let i = 0; i < Math.min(8, raw.length); i++) {
      const row = raw[i] || [];
      const cells = row.slice(3).filter(c => c != null && String(c).trim() !== "");
      const dateLikes = cells.filter(c => {
        const s = String(c).trim();
        return /\d{1,2}[.\-/]\d{1,2}(?:[.\-/]\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{2}\.\d{4}|\d{5}|январ|феврал|март|апрел|май|июн|июл|август|сентябр|октябр|ноябр|декабр/i.test(s);
      }).length;
      if (dateLikes >= 2) dateRowScore = Math.max(dateRowScore, dateLikes);
    }

    for (let i = 0; i < Math.min(40, raw.length); i++) {
      const row = raw[i] || [];
      const c0 = row[0] != null ? String(row[0]).trim().toLowerCase() : "";
      const c1 = row[1] != null ? String(row[1]).trim() : "";
      if (/показатель|ферритин|витамин|гемоглобин|белок|ттг|трансферрин/i.test(c0)) markerHints += 2;
      if (/^\s*\d+(?:[.,]\d+)?\s*[-–—]\s*\d+(?:[.,]\d+)?\s*$/.test(c1)) markerHints += 1;
    }

    const score = dateRowScore * 5 + markerHints;
    if (!best || score > best.score) best = { name, score };
  }

  return best && best.score >= 10 ? best.name : null;
};

module.exports = { detectAnalyticsSheet };
