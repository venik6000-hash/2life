const SHORT_WEEKDAYS_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

const pad2 = (n) => String(n).padStart(2, "0");

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// Local-midnight date (yyyy-mm-dd) treated as day index.
const dayIndex = (d) => {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.floor(t / 86400000);
};

export function formatChatListTime(iso, now = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (sameDay(d, now)) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const diffDays = dayIndex(now) - dayIndex(d);
  if (diffDays >= 1 && diffDays <= 6) return SHORT_WEEKDAYS_RU[d.getDay()];
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
