"use strict";

const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const { parseAnalyticsWorksheet } = require("../parsers/analytics");

const worksheetFromRows = (rows) => XLSX.utils.aoa_to_sheet(rows);

const analyticsWorksheet = worksheetFromRows([
  ["Служебная строка"],
  [
    null,
    null,
    null,
    "02.03-06.07.2024",
    "2/4/25",
    "2/4/25",
    "май 2025",
    "май 2025",
    "06.2025",
    "45658",
  ],
  [
    "Показатель",
    "Норма",
    "Оптимум",
    "Значение",
    "Значение",
    "Значение",
    "Причина отклонения",
    "Значение",
    "Значение",
    "Значение",
  ],
  [
    "Ферритин",
    "15,5–150,5",
    "Оптимум 50 нг/мл",
    "154.00",
    "4,53",
    "999",
    "не учитывается",
    "7",
    "-2,5",
    "8",
  ],
  ["Щитовидная железа"],
  [
    "ТТГ",
    "0.4-4.0",
    "1-2 мкЕд/мл",
    "2.1",
    null,
    null,
    null,
    "1,7",
    null,
    "3",
  ],
]);

const parsed = parseAnalyticsWorksheet(analyticsWorksheet);

assert.deepEqual(parsed.dates, [
  "02.03.2024",
  "02.04.2025",
  "01.05.2025",
  "01.06.2025",
  "01.01.2025",
]);
assert.equal(parsed.categoriesCount, 2);
assert.equal(parsed.markersCount, 2);

const [fallbackCategory, namedCategory] = parsed.analyticsCategories;
assert.equal(fallbackCategory.name, "Другое");
assert.equal(fallbackCategory.markers[0].name, "Ферритин");
assert.equal(fallbackCategory.markers[0].unit, "нг/мл");
assert.equal(fallbackCategory.markers[0].refMin, 15.5);
assert.equal(fallbackCategory.markers[0].refMax, 150.5);
assert.deepEqual(fallbackCategory.markers[0].values, [
  { date: "02.03.2024", value: 154, flagOff: false },
  { date: "02.04.2025", value: 4.53, flagOff: false },
  { date: "01.05.2025", value: 7, flagOff: false },
  { date: "01.06.2025", value: -2.5, flagOff: false },
  { date: "01.01.2025", value: 8, flagOff: false },
]);

assert.equal(namedCategory.name, "Щитовидная железа");
assert.equal(namedCategory.markers[0].unit, "мкЕд/мл");
assert.equal(namedCategory.markers[0].refMin, 0.4);
assert.equal(namedCategory.markers[0].refMax, 4);
assert.deepEqual(namedCategory.markers[0].values, [
  { date: "02.03.2024", value: 2.1, flagOff: false },
  { date: "01.05.2025", value: 1.7, flagOff: false },
  { date: "01.01.2025", value: 3, flagOff: false },
]);

const noDatesWorksheet = worksheetFromRows([
  ["Показатель", "Норма", "Оптимум"],
  ["Ферритин", "15-150", "50 нг/мл"],
]);
assert.equal(parseAnalyticsWorksheet(noDatesWorksheet), null);

console.log("analytics parser ok");
