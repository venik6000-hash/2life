const pad2 = (n) => String(n).padStart(2, "0");

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const yesterday = (now) => {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return y;
};

export function formatReadAt(iso, now = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (sameDay(d, now)) return `сегодня в ${time}`;
  if (sameDay(d, yesterday(now))) return `вчера в ${time}`;
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${time}`;
}
