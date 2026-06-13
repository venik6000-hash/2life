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

const addDaysIso = (iso, days) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
};

const JOURNAL_ACTUAL_FUTURE_DAYS = 7;

export const isJournalActual = (
  item,
  { today = getTodayIso(), futureDays = JOURNAL_ACTUAL_FUTURE_DAYS } = {},
) => {
  const type = String(item?.type || "");
  if (type !== "task" && type !== "event") return false;
  if (!isJournalOpenStatus(item?.status)) return false;
  const dueDate = normalizeJournalDate(item?.dueDate ?? item?.due_date);
  if (!dueDate) return false;
  const horizon = addDaysIso(today, Math.max(0, Number(futureDays) || 0));
  return dueDate <= horizon;
};

export const compareJournalDueAsc = (a, b) => {
  const aDate = normalizeJournalDate(a?.dueDate ?? a?.due_date) || "9999-12-31";
  const bDate = normalizeJournalDate(b?.dueDate ?? b?.due_date) || "9999-12-31";
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  const aTime = String(a?.dueTime ?? a?.due_time ?? "99:99");
  const bTime = String(b?.dueTime ?? b?.due_time ?? "99:99");
  return aTime.localeCompare(bTime);
};

export const BOARD_STATUSES = ["open", "in_progress", "waiting_client", "done"];

const isAlive = (item) => !(item?.deletedAt ?? item?.deleted_at);

export const isOnBoard = (item) => {
  const type = String(item?.type || "");
  if (type !== "task" && type !== "event") return false;
  return isAlive(item);
};

export const isInNotesPanel = (item) => {
  if (String(item?.type || "") !== "note") return false;
  return isAlive(item);
};

export const summarizeJournalItems = (items, { today = getTodayIso() } = {}) => {
  let open = 0;
  let todayCount = 0;
  let overdue = 0;
  for (const item of items || []) {
    if (!isOnBoard(item)) continue;
    if (!isJournalOpenStatus(item?.status)) continue;
    open += 1;
    const due = normalizeJournalDate(item?.dueDate ?? item?.due_date);
    if (!due) continue;
    if (due === today) todayCount += 1;
    else if (due < today) overdue += 1;
  }
  return { open, today: todayCount, overdue };
};

export const ASSIGNEE_FILTER_MODES = ["mine", "team", "mine_and_team", "all"];

export const matchesAssigneeFilter = (item, mode, userId) => {
  const assignee = Number(item?.assigneeUserId ?? item?.assignee_user_id);
  const isTeam = !!(item?.isTeamTask ?? item?.is_team_task);
  const mine = Number.isInteger(assignee) && assignee > 0 && assignee === Number(userId);
  switch (mode) {
    case "mine": return mine;
    case "team": return isTeam;
    case "mine_and_team": return mine || isTeam;
    case "all":
    default: return true;
  }
};
