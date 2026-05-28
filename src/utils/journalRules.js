export const JOURNAL_ITEM_TYPES = ["task", "event", "note"];
export const JOURNAL_OPEN_STATUSES = ["open", "in_progress", "waiting_client"];
export const JOURNAL_TERMINAL_STATUSES = ["done", "cancelled"];

export const JOURNAL_STATUS_LABELS = {
  open: "Открыто",
  in_progress: "В работе",
  waiting_client: "Ожидаем клиента",
  done: "Выполнено",
  cancelled: "Отменено",
};

export const JOURNAL_TYPE_LABELS = {
  task: "Задача",
  event: "Событие",
  note: "Заметка",
};

export const isJournalOpenStatus = (status) =>
  JOURNAL_OPEN_STATUSES.includes(String(status || ""));

export const normalizeJournalDate = (value) => {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
};

export const formatJournalDateRu = (value) => {
  const iso = normalizeJournalDate(value);
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
};

export const getTodayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

export const isJournalBadgeEligible = (item, { today = getTodayIso(), userId } = {}) => {
  const type = String(item?.type || "");
  if (type !== "task" && type !== "event") return false;
  if (!isJournalOpenStatus(item?.status)) return false;
  const dueDate = normalizeJournalDate(item?.dueDate ?? item?.due_date);
  if (!dueDate || dueDate > today) return false;
  if (item?.isTeamTask ?? item?.is_team_task) return true;
  const assignee = Number(item?.assigneeUserId ?? item?.assignee_user_id);
  return Number.isInteger(assignee) && assignee > 0 && assignee === Number(userId);
};

export const compareJournalDueAsc = (a, b) => {
  const aDate = normalizeJournalDate(a?.dueDate ?? a?.due_date) || "9999-12-31";
  const bDate = normalizeJournalDate(b?.dueDate ?? b?.due_date) || "9999-12-31";
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  const aTime = String(a?.dueTime ?? a?.due_time ?? "99:99");
  const bTime = String(b?.dueTime ?? b?.due_time ?? "99:99");
  return aTime.localeCompare(bTime);
};
