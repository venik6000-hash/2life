const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();

const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });
const { parseQuestionnaireWorkbook } = require('../parsers/questionnaire');
const { detectAnalyticsSheet } = require('../parsers/analytics');
const { requireAuth, requirePermission, requireSectionWrite } = require('../middleware/auth');

// ---------- Questionnaire Excel Parser ----------
router.post(
  "/import-questionnaire",
  requireAuth(),
  requirePermission("import_data"),
  requireSectionWrite("questionnaire"),
  upload.single("file"),
  (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });

    const wb = XLSX.readFile(req.file.path);
    const questionnaire = parseQuestionnaireWorkbook(wb);

    fs.unlinkSync(req.file.path);

    res.json({
      ok: true,
      kind: "questionnaire",
      gender: questionnaire.gender,
      sectionsCount: questionnaire.sections.length,
      answersCount: questionnaire.rawAnswers.length,
      questionnaire
    });
  } catch (e) {
    console.error("Questionnaire parse error:", e);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: e.message });
  }
  }
);

// ---------- Analytics Excel Parser ----------
router.post(
  "/import-analytics",
  requireAuth(),
  requirePermission("import_data"),
  requireSectionWrite("analytics"),
  upload.single("file"),
  (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });

    const wb = XLSX.readFile(req.file.path);

    // Find analytics sheet by content, not by sheet name
    let sheetName = detectAnalyticsSheet(wb);
    if (!sheetName) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Лист с анализами не найден по структуре данных", sheets: wb.SheetNames });
    }

    const ws = wb.Sheets[sheetName];
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

    if (!datesRow) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Не найдена строка с датами анализов" });
    }

    // Extract dates from columns 3+
    // Some columns are "Причина отклонения" — skip those
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

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    // Filter out empty categories
    const result = categories.filter(c => c.markers.length > 0);

    console.log(`Parsed: ${result.length} categories, ${result.reduce((a, c) => a + c.markers.length, 0)} markers, ${finalDateColumns.length} dates`);

    res.json({
      ok: true,
      dates: finalDateColumns.map(d => d.date),
      categoriesCount: result.length,
      markersCount: result.reduce((a, c) => a + c.markers.length, 0),
      analyticsCategories: result
    });

  } catch (e) {
    console.error("Parse error:", e);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: e.message });
  }
  }
);

module.exports = router;
