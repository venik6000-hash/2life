import assert from "node:assert/strict";
import {
  buildInjectionIcs,
  generateInjectionEvents,
} from "../src/utils/injectionSchedule.js";

const events = generateInjectionEvents({
  phases: [
    {
      type: "daily",
      startDate: "2026-06-01",
      durationDays: 2,
      drug: "Daily",
      dosage: "1 ml",
      instruction: "After meal",
      times: ["08:00", "20:30"],
    },
    {
      type: "weekdays",
      startDate: "2026-06-01",
      durationDays: 7,
      daysOfWeek: [1, 3, 5],
      drug: "Weekdays",
      times: ["10:00"],
    },
    {
      type: "interval",
      startDate: "2026-06-01",
      durationDays: 6,
      intervalDays: 2,
      drug: "Interval",
      times: ["12:00"],
    },
    {
      type: "daily",
      startDate: "not-a-date",
      durationDays: 3,
      drug: "Invalid",
    },
  ],
});

assert.deepEqual(
  events.map(({ dateIso, drug, times }) => ({ dateIso, drug, times })),
  [
    { dateIso: "2026-06-01", drug: "Daily", times: ["08:00", "20:30"] },
    { dateIso: "2026-06-02", drug: "Daily", times: ["08:00", "20:30"] },
    { dateIso: "2026-06-01", drug: "Weekdays", times: ["10:00"] },
    { dateIso: "2026-06-03", drug: "Weekdays", times: ["10:00"] },
    { dateIso: "2026-06-05", drug: "Weekdays", times: ["10:00"] },
    { dateIso: "2026-06-01", drug: "Interval", times: ["12:00"] },
    { dateIso: "2026-06-03", drug: "Interval", times: ["12:00"] },
    { dateIso: "2026-06-05", drug: "Interval", times: ["12:00"] },
  ],
  "phase order, day order, recurrence rules, multiple times, and invalid dates must be preserved",
);

assert.deepEqual(generateInjectionEvents({ phases: [] }), []);
assert.deepEqual(generateInjectionEvents({}), []);

assert.deepEqual(
  generateInjectionEvents({
    phases: [
      { type: "daily", startDate: "2026-06-10", durationDays: 0 },
      { type: "interval", startDate: "2026-06-11", durationDays: 3, intervalDays: 0 },
    ],
  }),
  [
    {
      dateIso: "2026-06-10",
      drug: "?",
      dosage: "",
      instruction: "",
      times: ["09:00"],
    },
    {
      dateIso: "2026-06-11",
      drug: "?",
      dosage: "",
      instruction: "",
      times: ["09:00"],
    },
    {
      dateIso: "2026-06-12",
      drug: "?",
      dosage: "",
      instruction: "",
      times: ["09:00"],
    },
    {
      dateIso: "2026-06-13",
      drug: "?",
      dosage: "",
      instruction: "",
      times: ["09:00"],
    },
  ],
  "durationDays||1, intervalDays||1, and event defaults must be preserved",
);

const fixedNow = new Date(2026, 5, 11, 15, 45, 30);
const exactIcs = buildInjectionIcs(
  [
    {
      dateIso: "2026-06-12",
      drug: "A,B;C\nD",
      dosage: "1,5; ml\nslow",
      instruction: "Line 1\nLine,2;end",
      times: ["08:05", "20:30"],
    },
    {
      dateIso: "2026-06-13",
      drug: "?",
      dosage: "",
      instruction: "",
      times: ["09:00"],
    },
  ],
  fixedNow,
);

assert.equal(
  exactIcs,
  "BEGIN:VCALENDAR\r\n" +
    "VERSION:2.0\r\n" +
    "PRODID:-//2life//Injections//RU\r\n" +
    "CALSCALE:GREGORIAN\r\n" +
    "METHOD:PUBLISH\r\n" +
    "BEGIN:VEVENT\r\n" +
    "UID:inj-1@2life\r\n" +
    "DTSTAMP:20260611T000000\r\n" +
    "DTSTART:20260612T080500\r\n" +
    "DTEND:20260612T080500\r\n" +
    "SUMMARY:Инъекция: A\\,B\\;C\\nD 1\\,5\\; ml\\nslow\r\n" +
    "DESCRIPTION:Line 1\\nLine\\,2\\;end\r\n" +
    "END:VEVENT\r\n" +
    "BEGIN:VEVENT\r\n" +
    "UID:inj-2@2life\r\n" +
    "DTSTAMP:20260611T000000\r\n" +
    "DTSTART:20260612T203000\r\n" +
    "DTEND:20260612T203000\r\n" +
    "SUMMARY:Инъекция: A\\,B\\;C\\nD 1\\,5\\; ml\\nslow\r\n" +
    "DESCRIPTION:Line 1\\nLine\\,2\\;end\r\n" +
    "END:VEVENT\r\n" +
    "BEGIN:VEVENT\r\n" +
    "UID:inj-3@2life\r\n" +
    "DTSTAMP:20260611T000000\r\n" +
    "DTSTART:20260613T090000\r\n" +
    "DTEND:20260613T090000\r\n" +
    "SUMMARY:Инъекция: ?\r\n" +
    "END:VEVENT\r\n" +
    "END:VCALENDAR",
  "ICS bytes, escaping, UID order, timestamps, CRLF, and final newline behavior must stay exact",
);

assert.equal(buildInjectionIcs([], fixedNow), "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//2life//Injections//RU\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR");

console.log("injection schedule ok");
