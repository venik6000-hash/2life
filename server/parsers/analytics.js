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

const parseAnalyticsWorksheet = (ws) => {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });

  // --- Step 1: Find dates row (row with dates in columns D+) ---
  let datesRow = null;
  let datesRowIdx = -1;
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const row = raw[i] || [];
    // Check if columns 3+ have date-like values
    const dateCells = row.slice(3).filter(c => c != null && String(c).trim() !== "");
    if (dateCells.length > 0) {
      const looksLikeDates = dateCells.some(c => /\d{2}[.\-\/]\d{2,4}|\d{4}/.test(String(c)));
      if (looksLikeDates) {
        datesRow = row;
        datesRowIdx = i;
        break;
      }
    }
  }

  if (!datesRow) return null;

  // Extract dates from columns 3+
  // Some columns are "Причина отклонения" — skip those
  const months = {
    "январ": "01",
    "феврал": "02",
    "март": "03",
    "апрел": "04",
    "май": "05",
    "мая": "05",
    "июн": "06",
    "июл": "07",
    "август": "08",
    "сентябр": "09",
    "октябр": "10",
    "ноябр": "11",
    "декабр": "12"
  };

  const dateColumns = []; // [{colIdx, date}]
  for (let c = 3; c < datesRow.length; c++) {
    const cell = datesRow[c];
    if (cell == null) continue;
    const s = String(cell).trim();
    if (!s) continue;

    // Normalize date string
    let dateStr = s;

    // Handle Excel serial numbers
    if (/^\d{5}$/.test(s)) {
      const d = XLSX.SSF.parse_date_code(parseInt(s, 10));
      if (d) {
        dateStr = `${String(d.d).padStart(2, "0")}.${String(d.m).padStart(2, "0")}.${d.y}`;
      }
    }

    let normalized = null;

    // Try date ranges like 02.03-06.07.2024 -> take first date as 02.03.2024
    let m = dateStr.match(/(\d{1,2})\.(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) {
      normalized = `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[5]}`;
    }

    // Try dd.mm.yyyy or dd/mm/yyyy or dd-mm-yyyy
    if (!normalized) {
      m = dateStr.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
      if (m) {
        let day = m[1].padStart(2, "0");
        let month = m[2].padStart(2, "0");
        let year = m[3];
        if (year.length === 2) year = "20" + year;
        if (year.length === 3) year = "2" + year; // "025" -> "2025"
        normalized = `${day}.${month}.${year}`;
      }
    }

    // Try yyyy-mm-dd
    if (!normalized) {
      m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        normalized = `${m[3]}.${m[2]}.${m[1]}`;
      }
    }

    // Try month name + year -> use first day of month
    if (!normalized) {
      for (const [prefix, num] of Object.entries(months)) {
        if (dateStr.toLowerCase().includes(prefix)) {
          const ym = dateStr.match(/(\d{4})/);
          if (ym) {
            normalized = `01.${num}.${ym[1]}`;
            break;
          }
        }
      }
    }

    // Try mm.yyyy -> use first day of month
    if (!normalized) {
      m = dateStr.match(/^(\d{2})\.(\d{4})$/);
      if (m) {
        normalized = `01.${m[1]}.${m[2]}`;
      }
    }

    if (normalized) {
      dateColumns.push({ colIdx: c, date: normalized });
    }
  }

  // Also check row below dates for "Показатель"/"Причина" to filter out reason columns
  const headerRow = raw[datesRowIdx + 1] || [];
  const filteredDateColumns = dateColumns.filter(dc => {
    const header = headerRow[dc.colIdx];
    if (header && /причин/i.test(String(header))) return false;
    return true;
  });

  // Deduplicate dates (keep first occurrence)
  const seenDates = new Set();
  const finalDateColumns = [];
  for (const dc of filteredDateColumns) {
    if (!seenDates.has(dc.date)) {
      seenDates.add(dc.date);
      finalDateColumns.push(dc);
    }
  }

  // --- Step 2: Parse categories and markers ---
  const categories = [];
  let currentCategory = null;
  const dataStartRow = datesRowIdx + 2; // skip dates row and header row

  for (let i = dataStartRow; i < raw.length; i++) {
    const row = raw[i] || [];
    const col0 = row[0] != null ? String(row[0]).trim() : "";
    const col1 = row[1] != null ? String(row[1]).trim() : "";
    const col2 = row[2] != null ? String(row[2]).trim() : "";

    if (!col0) continue;

    // Category row: only column 0 has data, columns 1-2 are empty
    const isCategory = col0.length > 0 && !col1 && !col2 &&
      !finalDateColumns.some(dc => row[dc.colIdx] != null && String(row[dc.colIdx]).trim() !== "");

    if (isCategory) {
      // Skip "Показатель" header rows
      if (/показатель|причин/i.test(col0)) continue;
      currentCategory = { name: col0, markers: [] };
      categories.push(currentCategory);
      continue;
    }

    // Marker row: column 0 = name, column 1 = norm, column 2 = optimum
    if (col0 && (col1 || col2)) {
      if (!currentCategory) {
        currentCategory = { name: "Другое", markers: [] };
        categories.push(currentCategory);
      }

      // Parse norm range
      let refMin = 0, refMax = 0;
      const normStr = col1.replace(/,/g, ".");
      const rangeMatch = normStr.match(/([\d.]+)\s*[-–—]\s*([\d.]+)/);
      if (rangeMatch) {
        refMin = parseFloat(rangeMatch[1]) || 0;
        refMax = parseFloat(rangeMatch[2]) || 0;
      }

      // Parse values for each date
      const values = [];
      for (const dc of finalDateColumns) {
        const cell = row[dc.colIdx];
        if (cell == null || String(cell).trim() === "") continue;

        let valStr = String(cell).trim().replace(/,/g, ".");
        // Remove non-numeric prefixes/suffixes but keep the number
        // Handle cases like "154.00", "4,53", etc.
        const numMatch = valStr.match(/-?[\d.]+/);
        if (numMatch) {
          const num = parseFloat(numMatch[0]);
          if (!isNaN(num)) {
            values.push({ date: dc.date, value: num, flagOff: false });
          }
        }
      }

      // Extract unit from optimum or norm
      let unit = "";
      const unitMatch = col2.match(/(г\/л|мкмоль\/л|ммоль\/л|мкЕд\/мл|нг\/мл|мкг\/л|нмоль\/л|мЕд\/л|пг\/мл|пг|фл|%|мм\/час|ед\/л|10[⁹\^]\/л)/i);
      if (unitMatch) unit = unitMatch[1];

      currentCategory.markers.push({
        name: col0,
        unit: unit,
        refMin: refMin,
        refMax: refMax,
        optimal: col2,
        values: values
      });
    }
  }

  const analyticsCategories = categories.filter(c => c.markers.length > 0);
  return {
    dates: finalDateColumns.map(d => d.date),
    categoriesCount: analyticsCategories.length,
    markersCount: analyticsCategories.reduce((a, c) => a + c.markers.length, 0),
    analyticsCategories
  };
};

module.exports = { detectAnalyticsSheet, parseAnalyticsWorksheet };
