export const formatLocalIsoDate = (date) => (
  date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : ""
);

export const parseLocalIsoDate = (iso) => {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(+match[1], +match[2] - 1, +match[3]) : null;
};

export function generateInjectionEvents(schedule) {
  if (!schedule?.phases?.length) return [];

  const events = [];
  for (const phase of schedule.phases) {
    const phaseStart = parseLocalIsoDate(phase.startDate);
    if (!phaseStart) continue;

    for (let day = 0; day < (phase.durationDays || 1); day += 1) {
      const date = new Date(
        phaseStart.getFullYear(),
        phaseStart.getMonth(),
        phaseStart.getDate() + day,
      );
      let include = false;
      if (phase.type === "daily") include = true;
      else if (phase.type === "weekdays") include = (phase.daysOfWeek || []).includes(date.getDay());
      else if (phase.type === "interval") include = day % (phase.intervalDays || 1) === 0;

      if (include) {
        events.push({
          dateIso: formatLocalIsoDate(date),
          drug: phase.drug || "?",
          dosage: phase.dosage || "",
          instruction: phase.instruction || "",
          times: phase.times || ["09:00"],
        });
      }
    }
  }
  return events;
}

export function buildInjectionIcs(events, now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const toDateTime = (iso, time) => {
    const [year, month, day] = iso.split("-");
    const [hour, minute] = (time || "09:00").split(":");
    return `${year}${month}${day}T${pad(hour)}${pad(minute)}00`;
  };
  const escapeText = (value) => (
    String(value || "").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")
  );

  let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//2life//Injections//RU\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n";
  let uid = 0;
  for (const event of events) {
    for (const time of event.times) {
      const dateTime = toDateTime(event.dateIso, time);
      ics += `BEGIN:VEVENT\r\nUID:inj-${++uid}@2life\r\nDTSTAMP:${toDateTime(formatLocalIsoDate(now), "00:00")}\r\nDTSTART:${dateTime}\r\nDTEND:${dateTime}\r\nSUMMARY:Инъекция: ${escapeText(event.drug)}${event.dosage ? ` ${escapeText(event.dosage)}` : ""}\r\n${event.instruction ? `DESCRIPTION:${escapeText(event.instruction)}\r\n` : ""}END:VEVENT\r\n`;
    }
  }
  ics += "END:VCALENDAR";
  return ics;
}
