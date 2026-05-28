# Journal Kanban Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stacked Current/Checklist/Feed journal panels with a 4-column Kanban board (statuses), compact card with native HTML5 D&D, inline comments popup, and a separate collapsed notes feed. Remove the checklist subsystem from frontend and backend; drop the related table and column from the local DB.

**Architecture:** Frontend-only redesign of `src/sections/Journal.jsx` and its components. New presentational components (`JournalSummary`, `JournalBoard`, `JournalColumn`, `JournalCard`, `JournalCommentsPopup`, `JournalNotesPanel`) replace four removed ones (`JournalCurrentPanel`, `JournalChecklistPanel`, `JournalFeed`, `JournalItemCard`). Existing API (`journalApi.js`), rules (`journalRules.js`), and editor (`JournalItemEditor.jsx`) are reused with small additive changes (new helpers, new optional `initialStatus` prop). Checklist code, routes, and schema are deleted in a single late task; production has none of it (`origin/main` verified 2026-05-28).

**Tech Stack:** React 18 + Vite, native HTML5 `draggable` D&D (pattern from `src/sections/LabOrder.jsx` + `src/components/LabOrderGroupCard.jsx`), inline-style theming via `useTheme()`, Node.js verify scripts (`node:assert/strict`, `fs`).

---

## Scope Check

One focused frontend redesign with a single coupled backend cleanup. Not separable into independent plans.

## File Structure

### Create
- `src/components/JournalSummary.jsx` — three-number summary strip.
- `src/components/JournalCard.jsx` — compact draggable card with comments-click and move-menu.
- `src/components/JournalColumn.jsx` — one column: header, drop zone, list, `+` button.
- `src/components/JournalBoard.jsx` — 4-column board, filter bar, drop dispatcher with optimistic update.
- `src/components/JournalCommentsPopup.jsx` — floating comments popup with composer.
- `src/components/JournalNotesPanel.jsx` — collapsed notes feed with add / quote-into-task / delete.
- `scripts/verifyJournalKanbanStatic.mjs` — static grep verifier for new components and removals.

### Modify
- `src/utils/journalRules.js` — add `isOnBoard`, `isInNotesPanel`, `summarizeJournalItems`, `matchesAssigneeFilter`, `BOARD_STATUSES`.
- `scripts/verifyJournalRules.mjs` — assert new helpers.
- `src/components/JournalItemEditor.jsx` — accept optional `initialStatus` prop (defaults to `"open"`).
- `src/sections/Journal.jsx` — full rewrite: load items, partition into board/notes, drive new components, drop checklist init.
- `src/utils/journalApi.js` — remove checklist-template functions and `initializeJournalChecklist`.
- `server/services/db.js` — remove checklist template DDL, seed call, `JOURNAL_DEFAULT_TEMPLATE_TITLES`, `seedJournalChecklistTemplate`; add idempotent drop migration for `journal_checklist_template_items` table and `journal_items.source_template_item_id` column; delete checklist rows on startup once.
- `server/services/journalStore.js` — remove `listJournalTemplateItems`, `upsertJournalTemplateItem`, `deleteJournalTemplateItem`, `initializeStageChecklist`, and `JOURNAL_DEFAULT_TEMPLATE_TITLES` re-export; stop writing `source_template_item_id` in `createJournalItem`.
- `server/routes/journal.js` — remove `/admin/journal/checklist-template*` and `/clients/:clientId/journal/stages/:stageId/checklist/initialize` routes.
- `src/components/AdminSectionPanel.jsx` — remove `AdminJournalTemplatePanel` import and usage.
- `package.json` — remove `verify:journal-checklist` script; add `verify:journal-kanban-static`.

### Delete
- `src/components/JournalCurrentPanel.jsx`
- `src/components/JournalChecklistPanel.jsx`
- `src/components/JournalFeed.jsx`
- `src/components/JournalItemCard.jsx`
- `src/components/JournalComments.jsx` (replaced by `JournalCommentsPopup`)
- `src/components/AdminJournalTemplatePanel.jsx`
- `scripts/verifyJournalChecklist.mjs`

## Acceptance Contract

Done means a logged-in employee with `journal.read`/`journal.write` opens a client, sees a four-column Kanban board with summary, can drag a card between columns and see status persist after reload, can click `💬 N` on a card to open a comments popup and add a comment, can expand the notes panel to read/add/quote/delete notes, the checklist UI and backend are entirely gone, and a fresh `npm install && initSchema` no longer creates `journal_checklist_template_items` or `source_template_item_id`.

Primary pass/fail:
- `npm run verify:journal-rules` passes (extended with new helpers).
- `npm run verify:journal-kanban-static` passes (new static checks).
- `npm run build` succeeds with no missing imports or unused warnings on the new code.
- Manual UAT (Task 13) passes all checks.

Secondary signals:
- `npm run verify:journal-api` still passes (unchanged endpoints).
- `npm run verify:journal-frontend-static` still passes.
- `npm --prefix server run smoke:journal-store` still passes for non-checklist functions; checklist-related tests removed.

---

### Task 1: Extend `journalRules.js` with board predicates and summary

**Files:**
- Modify: `src/utils/journalRules.js`
- Modify: `scripts/verifyJournalRules.mjs`

- [ ] **Step 1: Add failing assertions to the rules verifier**

In `scripts/verifyJournalRules.mjs`, update the existing top import to include the new names. The current import is:

```js
import {
  JOURNAL_OPEN_STATUSES,
  isJournalOpenStatus,
  isJournalBadgeEligible,
  isJournalActual,
  normalizeJournalDate,
  compareJournalDueAsc,
} from "../src/utils/journalRules.js";
```

Change it to:

```js
import {
  JOURNAL_OPEN_STATUSES,
  isJournalOpenStatus,
  isJournalBadgeEligible,
  isJournalActual,
  normalizeJournalDate,
  compareJournalDueAsc,
  BOARD_STATUSES,
  isOnBoard,
  isInNotesPanel,
  summarizeJournalItems,
  matchesAssigneeFilter,
} from "../src/utils/journalRules.js";
```

Then, above the final `console.log("journal rules ok");`, append these new assertions:

```js
assert.deepEqual(BOARD_STATUSES, ["open", "in_progress", "waiting_client", "done"]);

assert.equal(isOnBoard({ type: "task" }), true, "tasks live on the board");
assert.equal(isOnBoard({ type: "event" }), true, "events live on the board");
assert.equal(isOnBoard({ type: "note" }), false, "notes do not live on the board");
assert.equal(isOnBoard({ type: "task", deletedAt: "2026-01-01" }), false, "deleted items are off-board");

assert.equal(isInNotesPanel({ type: "note" }), true);
assert.equal(isInNotesPanel({ type: "task" }), false);
assert.equal(isInNotesPanel({ type: "note", deletedAt: "2026-01-01" }), false);

const summarized = summarizeJournalItems(
  [
    { type: "task", status: "open", dueDate: "2026-05-28" }, // today
    { type: "task", status: "in_progress", dueDate: "2026-05-27" }, // overdue
    { type: "event", status: "waiting_client", dueDate: "2026-05-30" }, // future open
    { type: "task", status: "done", dueDate: "2026-05-28" }, // closed, ignored
    { type: "note", status: "done", dueDate: "" }, // notes ignored
  ],
  { today: "2026-05-28" }
);
assert.deepEqual(summarized, { open: 3, today: 1, overdue: 1 });

assert.equal(matchesAssigneeFilter({ assigneeUserId: 7, isTeamTask: false }, "mine", 7), true);
assert.equal(matchesAssigneeFilter({ assigneeUserId: 8, isTeamTask: false }, "mine", 7), false);
assert.equal(matchesAssigneeFilter({ assigneeUserId: null, isTeamTask: true }, "team", 7), true);
assert.equal(matchesAssigneeFilter({ assigneeUserId: 7, isTeamTask: false }, "team", 7), false);
assert.equal(matchesAssigneeFilter({ assigneeUserId: 7, isTeamTask: false }, "mine_and_team", 7), true);
assert.equal(matchesAssigneeFilter({ assigneeUserId: null, isTeamTask: true }, "mine_and_team", 7), true);
assert.equal(matchesAssigneeFilter({ assigneeUserId: 8, isTeamTask: false }, "mine_and_team", 7), false);
assert.equal(matchesAssigneeFilter({ assigneeUserId: 8, isTeamTask: false }, "all", 7), true);
```

- [ ] **Step 2: Run verifier to confirm failure**

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-rules
```

Expected: fail because `BOARD_STATUSES`, `isOnBoard`, `isInNotesPanel`, `summarizeJournalItems`, `matchesAssigneeFilter` are not exported.

- [ ] **Step 3: Implement the helpers**

In `src/utils/journalRules.js`, append at the bottom (after `compareJournalDueAsc`):

```js
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
```

- [ ] **Step 4: Re-run verifier**

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-rules
```

Expected: `journal rules ok`.

- [ ] **Step 5: Commit**

```bash
git add scripts/verifyJournalRules.mjs src/utils/journalRules.js
git commit -m "feat: add journal board predicates and summary helpers"
```

---

### Task 2: Add `initialStatus` prop to `JournalItemEditor`

**Files:**
- Modify: `src/components/JournalItemEditor.jsx`

- [ ] **Step 1: Accept and use the new prop**

In `src/components/JournalItemEditor.jsx`, change the component signature:

```jsx
export default function JournalItemEditor({
  stages = [],
  initialType,
  initialStageId,
  initialStatus,
  item,
  onClose,
  onSave,
}) {
```

Inside the `useMemo` that builds `initial`, replace the new-item branch with:

```jsx
    return {
      type: initialType || "task",
      stageId: initialStageId == null ? "" : String(initialStageId),
      title: "",
      description: "",
      status: initialStatus || "open",
      dueDate: "",
      dueTime: "",
      assigneeUserId: "",
      isTeamTask: true,
      priority: "normal",
    };
```

Update the `useMemo` dependency array to include `initialStatus`:

```jsx
  }, [item, initialType, initialStageId, initialStatus]);
```

- [ ] **Step 2: Smoke-build to confirm no syntax errors**

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/JournalItemEditor.jsx
git commit -m "feat: accept initialStatus in JournalItemEditor"
```

---

### Task 3: Build `JournalSummary` component

**Files:**
- Create: `src/components/JournalSummary.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/JournalSummary.jsx`:

```jsx
import { useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { summarizeJournalItems, getTodayIso } from "../utils/journalRules";

export default function JournalSummary({ items = [], today = getTodayIso() }) {
  const { $ } = useTheme();
  const summary = useMemo(() => summarizeJournalItems(items, { today }), [items, today]);

  const Cell = ({ label, value, color }) => (
    <div
      style={{
        flex: 1,
        padding: "10px 14px",
        background: $.bgI,
        border: `1px solid ${$.brd}`,
        borderRadius: 8,
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, color: $.txS, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={{ marginLeft: "auto", fontSize: 20, fontWeight: 800, color }}>
        {value}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <Cell label="Открытых" value={summary.open} color={$.tx} />
      <Cell label="На сегодня" value={summary.today} color={summary.today > 0 ? $.wr : $.tx} />
      <Cell label="Просрочено" value={summary.overdue} color={summary.overdue > 0 ? $.dn : $.tx} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/JournalSummary.jsx
git commit -m "feat: add JournalSummary component"
```

---

### Task 4: Build `JournalCommentsPopup` component

**Files:**
- Create: `src/components/JournalCommentsPopup.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/JournalCommentsPopup.jsx`:

```jsx
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import Button from "./Button";

const POPUP_WIDTH = 320;
const POPUP_MAX_HEIGHT = 360;
const VIEWPORT_MARGIN = 8;

const formatStamp = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const computePosition = (anchorRect) => {
  if (!anchorRect) return { top: 80, left: 80 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = anchorRect.left;
  if (left + POPUP_WIDTH + VIEWPORT_MARGIN > vw) {
    left = Math.max(VIEWPORT_MARGIN, vw - POPUP_WIDTH - VIEWPORT_MARGIN);
  }
  let top = anchorRect.bottom + 6;
  if (top + POPUP_MAX_HEIGHT + VIEWPORT_MARGIN > vh) {
    top = Math.max(VIEWPORT_MARGIN, anchorRect.top - POPUP_MAX_HEIGHT - 6);
  }
  return { top, left };
};

export default function JournalCommentsPopup({
  item,
  anchorRect,
  readOnly = false,
  onClose,
  onAddComment,
}) {
  const { $ } = useTheme();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const containerRef = useRef(null);
  const composerRef = useRef(null);
  const listRef = useRef(null);

  const comments = Array.isArray(item?.comments) ? item.comments : [];
  const pos = computePosition(anchorRect);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose && onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments.length]);

  useEffect(() => {
    if (composerRef.current && !readOnly) composerRef.current.focus();
  }, [readOnly]);

  const submit = async () => {
    const body = text.trim();
    if (!body || !onAddComment) return;
    setErr("");
    try {
      setSending(true);
      await onAddComment(item, body);
      setText("");
    } catch (e) {
      setErr(e.message || "Не удалось отправить комментарий");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "transparent" }}
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Комментарии"
        style={{
          position: "absolute",
          top: pos.top,
          left: pos.left,
          width: POPUP_WIDTH,
          maxHeight: POPUP_MAX_HEIGHT,
          background: $.bgC,
          border: `1px solid ${$.brd}`,
          borderRadius: 10,
          boxShadow: $.sh,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${$.brd}`, fontSize: 12, color: $.txS, fontWeight: 600 }}>
          Комментарии · {comments.length}
        </div>
        <div
          ref={listRef}
          style={{ padding: "8px 12px", overflowY: "auto", flex: 1, display: "grid", gap: 8, fontSize: 12, color: $.tx, minHeight: 60 }}
        >
          {comments.length === 0 ? (
            <div style={{ color: $.txM }}>Пока нет комментариев.</div>
          ) : (
            comments.map((c) => (
              <div key={c.id} style={{ display: "grid", gap: 2 }}>
                <div style={{ color: $.txS, fontSize: 11 }}>
                  #{c.authorUserId || "—"} · {formatStamp(c.createdAt)}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
              </div>
            ))
          )}
        </div>
        {!readOnly && (
          <div style={{ padding: 10, borderTop: `1px solid ${$.brd}`, display: "grid", gap: 6 }}>
            {err && <div style={{ color: $.dn, fontSize: 11 }}>{err}</div>}
            <textarea
              ref={composerRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder="Написать комментарий... (Cmd/Ctrl+Enter — отправить)"
              rows={2}
              style={{
                padding: "6px 8px",
                borderRadius: 6,
                border: `1px solid ${$.brd}`,
                background: $.bgI,
                color: $.tx,
                fontSize: 12,
                fontFamily: "inherit",
                resize: "vertical",
                minHeight: 40,
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <Button size="sm" variant="ghost" onClick={onClose}>Закрыть</Button>
              <Button size="sm" variant="solid" tone="accent" onClick={submit} disabled={sending || !text.trim()}>
                {sending ? "Отправка..." : "Отправить"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/JournalCommentsPopup.jsx
git commit -m "feat: add JournalCommentsPopup component"
```

---

### Task 5: Build `JournalCard` component

**Files:**
- Create: `src/components/JournalCard.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/JournalCard.jsx`:

```jsx
import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import {
  BOARD_STATUSES,
  JOURNAL_STATUS_LABELS,
  JOURNAL_TYPE_LABELS,
  formatJournalDateRu,
  getTodayIso,
  normalizeJournalDate,
} from "../utils/journalRules";

const typeTone = (type, $) =>
  type === "task" ? $.ac : type === "event" ? $.in : $.txS;

const initials = (item) => {
  const id = item?.assigneeUserId;
  if (!id) return "";
  return `#${id}`;
};

export default function JournalCard({
  item,
  stages = [],
  readOnly = false,
  onClick,
  onCommentClick,
  onMove,
  onDragStart,
  onDragEnd,
}) {
  const { $ } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const stage = stages.find((s) => Number(s.id) === Number(item.stageId));
  const today = getTodayIso();
  const due = normalizeJournalDate(item?.dueDate);
  const isOpenish = ["open", "in_progress", "waiting_client"].includes(item?.status);
  const isCancelled = item?.status === "cancelled";
  const isOverdue = isOpenish && due && due < today;
  const isToday = isOpenish && due && due === today;

  const priorityBorder =
    item?.priority === "high" || item?.priority === "urgent" ? $.dn : $.brd;

  const dueLine = (item?.dueDate || item?.dueTime)
    ? `${formatJournalDateRu(item.dueDate) || "—"}${item.dueTime ? ` · ${String(item.dueTime).slice(0, 5)}` : ""}`
    : "";

  const commentCount = Array.isArray(item?.comments) ? item.comments.length : 0;

  const handleDragStart = (e) => {
    if (readOnly) { e.preventDefault(); return; }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ type: "journal-item", id: item.id, fromStatus: item.status })
    );
    if (onDragStart) onDragStart(item);
  };

  const handleDragEnd = () => {
    if (onDragEnd) onDragEnd(item);
  };

  const triggerMove = (status) => {
    setMenuOpen(false);
    if (onMove && status !== item.status) onMove(item, status);
  };

  const handleCommentClick = (e) => {
    e.stopPropagation();
    if (!onCommentClick) return;
    const anchorRect = e.currentTarget.getBoundingClientRect();
    onCommentClick(item, anchorRect);
  };

  const cardClick = (e) => {
    if (e.target.closest("[data-card-icon]")) return;
    if (onClick) onClick(item);
  };

  return (
    <div
      draggable={!readOnly}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={cardClick}
      data-journal-card-id={item.id}
      style={{
        background: $.bgI,
        border: `1px solid ${$.brd}`,
        borderLeft: `3px solid ${priorityBorder}`,
        borderRadius: 8,
        padding: "10px 12px",
        cursor: readOnly ? "default" : "grab",
        display: "grid",
        gap: 6,
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ color: typeTone(item.type, $), fontWeight: 700, fontSize: 11, letterSpacing: 0.3 }}>
          {(JOURNAL_TYPE_LABELS[item.type] || item.type).toUpperCase()}
        </span>
        {stage && (
          <span style={{ fontSize: 11, color: $.txS }}>
            · {stage.title || `Этап ${stage.id}`}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {isCancelled && (
            <span style={{ fontSize: 10, color: $.txS, padding: "1px 6px", border: `1px solid ${$.brd}`, borderRadius: 999 }}>
              отменено
            </span>
          )}
          {!isCancelled && isOverdue && (
            <span style={{ fontSize: 11, color: $.dn, fontWeight: 700 }}>🔴 просрочено</span>
          )}
          {!isCancelled && !isOverdue && isToday && (
            <span style={{ fontSize: 11, color: $.wr, fontWeight: 700 }}>🟡 сегодня</span>
          )}
        </div>
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: $.tx,
          lineHeight: 1.25,
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: 2,
          overflow: "hidden",
        }}
      >
        {item.title || "(без названия)"}
      </div>

      {item.description && (
        <div
          title={item.description}
          style={{
            fontSize: 12,
            color: $.txS,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.description}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: $.txM, marginTop: 2 }}>
        {dueLine && <span>📅 {dueLine}</span>}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {item.isTeamTask ? (
            <span title="Командная задача">👥</span>
          ) : (
            initials(item) && <span title={`Исполнитель ${initials(item)}`}>{initials(item)}</span>
          )}
          {commentCount > 0 && (
            <button
              data-card-icon="comments"
              onClick={handleCommentClick}
              style={{
                background: "transparent",
                border: "none",
                color: $.txS,
                cursor: "pointer",
                padding: 0,
                font: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              💬 {commentCount}
            </button>
          )}
          {commentCount === 0 && !readOnly && onCommentClick && (
            <button
              data-card-icon="comments-empty"
              onClick={handleCommentClick}
              title="Добавить комментарий"
              style={{
                background: "transparent",
                border: "none",
                color: $.txM,
                cursor: "pointer",
                padding: 0,
                font: "inherit",
              }}
            >
              💬
            </button>
          )}
          {!readOnly && onMove && (
            <span style={{ position: "relative" }}>
              <button
                data-card-icon="menu"
                onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
                title="Переместить"
                style={{
                  background: "transparent",
                  border: "none",
                  color: $.txM,
                  cursor: "pointer",
                  padding: 0,
                  font: "inherit",
                }}
              >
                ⋯
              </button>
              {menuOpen && (
                <div
                  data-card-icon="menu-popover"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "100%",
                    marginTop: 4,
                    background: $.bgC,
                    border: `1px solid ${$.brd}`,
                    borderRadius: 6,
                    boxShadow: $.sh,
                    padding: 4,
                    display: "grid",
                    gap: 2,
                    zIndex: 5,
                    minWidth: 160,
                  }}
                >
                  {BOARD_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => triggerMove(s)}
                      disabled={s === item.status}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: s === item.status ? $.txM : $.tx,
                        textAlign: "left",
                        padding: "4px 8px",
                        borderRadius: 4,
                        cursor: s === item.status ? "default" : "pointer",
                        font: "inherit",
                      }}
                    >
                      → {JOURNAL_STATUS_LABELS[s]}
                    </button>
                  ))}
                  <button
                    onClick={() => triggerMove("cancelled")}
                    disabled={item.status === "cancelled"}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: item.status === "cancelled" ? $.txM : $.dn,
                      textAlign: "left",
                      padding: "4px 8px",
                      borderRadius: 4,
                      cursor: item.status === "cancelled" ? "default" : "pointer",
                      font: "inherit",
                    }}
                  >
                    × Отменить
                  </button>
                </div>
              )}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/JournalCard.jsx
git commit -m "feat: add JournalCard component"
```

---

### Task 6: Build `JournalColumn` component

**Files:**
- Create: `src/components/JournalColumn.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/JournalColumn.jsx`:

```jsx
import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import JournalCard from "./JournalCard";

const COLUMN_TONE = {
  open: "txS",
  in_progress: "in",
  waiting_client: "wr",
  done: "ac",
};

export default function JournalColumn({
  status,
  label,
  items = [],
  stages = [],
  readOnly = false,
  onCardClick,
  onCardCommentClick,
  onCardMove,
  onCardDragStart,
  onCardDragEnd,
  onDropCard,
  onCreate,
}) {
  const { $ } = useTheme();
  const [highlighted, setHighlighted] = useState(false);
  const accent = $[COLUMN_TONE[status]] || $.txS;

  const handleDragOver = (e) => {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!highlighted) setHighlighted(true);
  };

  const handleDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setHighlighted(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setHighlighted(false);
    if (readOnly || !onDropCard) return;
    let payload = null;
    try {
      payload = JSON.parse(e.dataTransfer.getData("application/json") || "null");
    } catch (_) {
      payload = null;
    }
    if (!payload || payload.type !== "journal-item") return;
    if (payload.fromStatus === status) return;
    onDropCard({ id: payload.id, fromStatus: payload.fromStatus, toStatus: status });
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        background: $.bg,
        border: `1px solid ${highlighted ? accent : $.brd}`,
        borderRadius: 10,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 240,
        transition: "border-color .12s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: $.txM, fontWeight: 700 }}>
          {items.length}
        </span>
        {!readOnly && onCreate && (
          <button
            onClick={() => onCreate(status)}
            title={`Создать задачу в «${label}»`}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: `1px solid ${$.brd}`,
              color: $.txS,
              borderRadius: 6,
              padding: "1px 8px",
              fontSize: 13,
              cursor: "pointer",
              font: "inherit",
              lineHeight: 1.4,
            }}
          >
            +
          </button>
        )}
      </div>
      <div style={{ display: "grid", gap: 6, overflowY: "auto", maxHeight: "calc(100vh - 320px)" }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 12, color: $.txM, padding: 12, textAlign: "center" }}>
            Пусто
          </div>
        ) : (
          items.map((item) => (
            <JournalCard
              key={item.id}
              item={item}
              stages={stages}
              readOnly={readOnly}
              onClick={onCardClick}
              onCommentClick={onCardCommentClick}
              onMove={onCardMove}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/JournalColumn.jsx
git commit -m "feat: add JournalColumn component"
```

---

### Task 7: Build `JournalBoard` component

**Files:**
- Create: `src/components/JournalBoard.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/JournalBoard.jsx`:

```jsx
import { useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import JournalColumn from "./JournalColumn";
import Button from "./Button";
import {
  BOARD_STATUSES,
  JOURNAL_STATUS_LABELS,
  ASSIGNEE_FILTER_MODES,
  matchesAssigneeFilter,
  compareJournalDueAsc,
} from "../utils/journalRules";

const ASSIGNEE_LABELS = {
  mine: "Мои",
  team: "Команды",
  mine_and_team: "Мои + команда",
  all: "Все",
};

const TYPE_OPTIONS = [
  { id: "all", label: "Все типы" },
  { id: "task", label: "Задачи" },
  { id: "event", label: "События" },
];

const STAGE_FILTER_ALL = "all";
const STAGE_FILTER_NONE = "none";

const sortColumn = (status, items) => {
  if (status === "done") {
    return [...items].sort((a, b) => {
      const aT = a.updatedAt || a.completedAt || a.createdAt || "";
      const bT = b.updatedAt || b.completedAt || b.createdAt || "";
      return String(bT).localeCompare(String(aT));
    });
  }
  return [...items].sort(compareJournalDueAsc);
};

export default function JournalBoard({
  items = [],
  stages = [],
  currentUserId,
  readOnly = false,
  onEditItem,
  onCreateItem,
  onMoveItem,
  onDropItem,
  onCommentClick,
}) {
  const { $ } = useTheme();
  const [stageFilter, setStageFilter] = useState(STAGE_FILTER_ALL);
  const [assigneeFilter, setAssigneeFilter] = useState("mine_and_team");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (stageFilter === STAGE_FILTER_NONE) {
        if (item.stageId != null) return false;
      } else if (stageFilter !== STAGE_FILTER_ALL) {
        if (Number(item.stageId) !== Number(stageFilter)) return false;
      }
      if (!matchesAssigneeFilter(item, assigneeFilter, currentUserId)) return false;
      return true;
    });
  }, [items, stageFilter, assigneeFilter, typeFilter, currentUserId]);

  const columns = useMemo(() => {
    const buckets = {
      open: [],
      in_progress: [],
      waiting_client: [],
      done: [],
    };
    for (const item of filtered) {
      if (item.status === "cancelled") {
        buckets.done.push(item);
        continue;
      }
      if (buckets[item.status]) buckets[item.status].push(item);
    }
    return BOARD_STATUSES.map((s) => ({
      status: s,
      label: JOURNAL_STATUS_LABELS[s],
      items: sortColumn(s, buckets[s]),
    }));
  }, [filtered]);

  const selectStyle = {
    fontSize: 12,
    padding: "5px 8px",
    borderRadius: 6,
    border: `1px solid ${$.brd}`,
    background: $.bgI,
    color: $.tx,
    fontFamily: "inherit",
  };

  const stageForNewTask =
    stageFilter !== STAGE_FILTER_ALL && stageFilter !== STAGE_FILTER_NONE
      ? Number(stageFilter)
      : undefined;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: $.txS }}>
          Этап:
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={selectStyle}>
            <option value={STAGE_FILTER_ALL}>Все</option>
            <option value={STAGE_FILTER_NONE}>Без этапа</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.title || `Этап ${s.id}`}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: $.txS }}>
          Исполнитель:
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={selectStyle}>
            {ASSIGNEE_FILTER_MODES.map((m) => (
              <option key={m} value={m}>{ASSIGNEE_LABELS[m]}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: $.txS }}>
          Тип:
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
        <div style={{ marginLeft: "auto" }}>
          {!readOnly && (
            <Button
              size="sm"
              variant="solid"
              tone="accent"
              onClick={() => onCreateItem && onCreateItem({ type: "task", status: "open", stageId: stageForNewTask })}
            >
              + Задача
            </Button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {columns.map((col) => (
          <JournalColumn
            key={col.status}
            status={col.status}
            label={col.label}
            items={col.items}
            stages={stages}
            readOnly={readOnly}
            onCardClick={onEditItem}
            onCardCommentClick={onCommentClick}
            onCardMove={onMoveItem}
            onDropCard={onDropItem}
            onCreate={(status) =>
              onCreateItem && onCreateItem({
                type: "task",
                status,
                stageId: stageForNewTask,
              })
            }
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/JournalBoard.jsx
git commit -m "feat: add JournalBoard component"
```

---

### Task 8: Build `JournalNotesPanel` component

**Files:**
- Create: `src/components/JournalNotesPanel.jsx`

- [ ] **Step 1: Write the component**

Create `src/components/JournalNotesPanel.jsx`:

```jsx
import { useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import { formatJournalDateRu } from "../utils/journalRules";

const formatCreated = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
};

const noteHasQuotedTask = (note, allItems) => {
  if (!note?.id) return false;
  return allItems.some((it) => {
    const refId = it?.metadata?.quotedFromNoteId;
    return refId != null && Number(refId) === Number(note.id);
  });
};

export default function JournalNotesPanel({
  notes = [],
  allItems = [],
  stages = [],
  readOnly = false,
  onEditNote,
  onAddNote,
  onQuoteToTask,
  onDeleteNote,
}) {
  const { $ } = useTheme();
  const [open, setOpen] = useState(false);

  const sorted = useMemo(
    () => [...notes].sort((a, b) => {
      const aT = a.createdAt || "";
      const bT = b.createdAt || "";
      return String(bT).localeCompare(String(aT));
    }),
    [notes]
  );

  return (
    <div
      style={{
        background: $.bgC,
        border: `1px solid ${$.brd}`,
        borderRadius: 10,
        padding: 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            background: "transparent",
            border: "none",
            color: $.tx,
            cursor: "pointer",
            font: "inherit",
            fontSize: 13,
            fontWeight: 700,
            padding: 0,
          }}
        >
          {open ? "▾" : "▸"} Заметки · {sorted.length}
        </button>
        {!readOnly && (
          <Button size="xs" variant="ghost" tone="accent" onClick={onAddNote}>
            + Добавить заметку
          </Button>
        )}
      </div>
      {open && (
        <div style={{ display: "grid", gap: 6 }}>
          {sorted.length === 0 && (
            <div style={{ fontSize: 12, color: $.txM }}>Заметок пока нет.</div>
          )}
          {sorted.map((note) => {
            const stage = stages.find((s) => Number(s.id) === Number(note.stageId));
            const quoted = noteHasQuotedTask(note, allItems);
            const text = note.description || note.title || "";
            return (
              <div
                key={note.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "6px 8px",
                  borderRadius: 7,
                  background: $.bgI,
                  border: `1px solid ${$.brd}`,
                }}
              >
                <span style={{ fontSize: 11, color: $.txS, minWidth: 48 }}>
                  {formatCreated(note.createdAt)}
                </span>
                <span style={{ fontSize: 11, color: $.txS, minWidth: 38 }}>
                  #{note.createdBy || "—"}
                </span>
                <div
                  onClick={() => onEditNote && onEditNote(note)}
                  style={{ flex: 1, fontSize: 12, color: $.tx, cursor: "pointer", whiteSpace: "pre-wrap" }}
                >
                  {text || "(пустая заметка)"}
                </div>
                {stage && (
                  <span style={{ fontSize: 10, color: $.txS, padding: "1px 6px", border: `1px solid ${$.brd}`, borderRadius: 999 }}>
                    {stage.title || `Этап ${stage.id}`}
                  </span>
                )}
                {quoted && (
                  <span title="Есть связанные задачи" style={{ fontSize: 11, color: $.txS }}>🔗</span>
                )}
                {!readOnly && onQuoteToTask && (
                  <button
                    onClick={() => onQuoteToTask(note)}
                    title="Создать задачу из заметки"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: $.in,
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: 11,
                    }}
                  >
                    → задача
                  </button>
                )}
                {!readOnly && onDeleteNote && (
                  <button
                    onClick={() => onDeleteNote(note)}
                    title="Удалить заметку"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: $.dn,
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: 11,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/JournalNotesPanel.jsx
git commit -m "feat: add JournalNotesPanel component"
```

---

### Task 9: Rewrite `Journal.jsx` section to wire all new components

**Files:**
- Modify: `src/sections/Journal.jsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/sections/Journal.jsx` with:

```jsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  createJournalComment,
  createJournalItem,
  deleteJournalItem,
  fetchJournal,
  updateJournalItem,
} from "../utils/journalApi";
import {
  getTodayIso,
  isOnBoard,
  isInNotesPanel,
} from "../utils/journalRules";
import JournalSummary from "../components/JournalSummary";
import JournalBoard from "../components/JournalBoard";
import JournalCommentsPopup from "../components/JournalCommentsPopup";
import JournalNotesPanel from "../components/JournalNotesPanel";
import JournalItemEditor from "../components/JournalItemEditor";

export default function JournalSection({ clientId, stages = [], readOnly = false, onChanged }) {
  const { authFetch, user } = useAuth();
  const { $ } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [commentPopup, setCommentPopup] = useState(null);

  const loadJournal = async () => {
    if (!clientId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchJournal(authFetch, clientId);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || "Не удалось загрузить журнал");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJournal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const today = getTodayIso();

  const boardItems = useMemo(() => items.filter(isOnBoard), [items]);
  const noteItems = useMemo(() => items.filter(isInNotesPanel), [items]);

  const refreshAfterChange = async () => {
    await loadJournal();
    if (onChanged) await onChanged();
  };

  const saveItem = async (payload) => {
    if (editor?.item?.id) await updateJournalItem(authFetch, clientId, editor.item.id, payload);
    else await createJournalItem(authFetch, clientId, payload);
    setEditor(null);
    await refreshAfterChange();
  };

  const removeItem = async (item) => {
    if (!window.confirm(`Удалить «${item.title || "запись журнала"}»?`)) return;
    await deleteJournalItem(authFetch, clientId, item.id, "Удалено из интерфейса журнала");
    await refreshAfterChange();
  };

  const addComment = async (item, body) => {
    await createJournalComment(authFetch, clientId, item.id, body);
    await refreshAfterChange();
  };

  const handleMove = async (item, toStatus) => {
    if (!toStatus || toStatus === item.status) return;
    await updateJournalItem(authFetch, clientId, item.id, { status: toStatus });
    await refreshAfterChange();
  };

  const handleDrop = async ({ id, fromStatus, toStatus }) => {
    if (!id || fromStatus === toStatus) return;
    // Optimistic update.
    setItems((prev) =>
      prev.map((it) => (Number(it.id) === Number(id) ? { ...it, status: toStatus } : it))
    );
    try {
      await updateJournalItem(authFetch, clientId, id, { status: toStatus });
      await refreshAfterChange();
    } catch (err) {
      // Rollback: full reload to get truth.
      window.alert(err.message || "Не удалось обновить статус");
      await loadJournal();
    }
  };

  const openCreate = ({ type = "task", status = "open", stageId } = {}) =>
    setEditor({ type, status, stageId });

  const openEdit = (item) => setEditor({ item });

  const handleAddNote = () => openCreate({ type: "note" });

  const handleQuoteToTask = async (note) => {
    const payload = {
      type: "task",
      status: "open",
      title: note.title && note.title !== "Заметка" ? note.title : (note.description || "Из заметки").slice(0, 80),
      description: note.description || "",
      stageId: note.stageId == null ? null : Number(note.stageId),
      assigneeUserId: null,
      isTeamTask: true,
      priority: "normal",
      dueDate: "",
      dueTime: "",
      metadata: { quotedFromNoteId: note.id },
    };
    await createJournalItem(authFetch, clientId, payload);
    await refreshAfterChange();
  };

  const handleCommentIconClick = (item, anchorRect) =>
    setCommentPopup({ itemId: item.id, anchorRect });

  const popupItem = commentPopup
    ? items.find((it) => Number(it.id) === Number(commentPopup.itemId))
    : null;

  if (loading) return <div style={{ padding: 16 }}>Загрузка журнала...</div>;
  if (error) return <div style={{ padding: 16, color: $.dn }}>{error}</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <JournalSummary items={items} today={today} />
      <JournalBoard
        items={boardItems}
        stages={stages}
        currentUserId={user?.id}
        readOnly={readOnly}
        onEditItem={openEdit}
        onCreateItem={openCreate}
        onMoveItem={handleMove}
        onDropItem={handleDrop}
        onCommentClick={handleCommentIconClick}
      />
      <JournalNotesPanel
        notes={noteItems}
        allItems={items}
        stages={stages}
        readOnly={readOnly}
        onEditNote={openEdit}
        onAddNote={handleAddNote}
        onQuoteToTask={handleQuoteToTask}
        onDeleteNote={removeItem}
      />
      {popupItem && (
        <JournalCommentsPopup
          item={popupItem}
          anchorRect={commentPopup.anchorRect}
          readOnly={readOnly}
          onClose={() => setCommentPopup(null)}
          onAddComment={addComment}
        />
      )}
      {editor && (
        <JournalItemEditor
          stages={stages}
          initialType={editor.type}
          initialStatus={editor.status}
          initialStageId={editor.stageId}
          item={editor.item}
          onClose={() => setEditor(null)}
          onSave={saveItem}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify imports**

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: build succeeds. If a stale import to `JournalCurrentPanel`/`JournalChecklistPanel`/`JournalFeed`/`JournalItemCard`/`JournalComments` is reported, remove it.

- [ ] **Step 3: Commit**

```bash
git add src/sections/Journal.jsx
git commit -m "feat: rewrite Journal section to drive Kanban board"
```

---

### Task 10: Add static verifier for the new components

**Files:**
- Create: `scripts/verifyJournalKanbanStatic.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the verifier**

Create `scripts/verifyJournalKanbanStatic.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const exists = (path) => fs.existsSync(path);

// New components exist and export defaults.
for (const path of [
  "src/components/JournalSummary.jsx",
  "src/components/JournalBoard.jsx",
  "src/components/JournalColumn.jsx",
  "src/components/JournalCard.jsx",
  "src/components/JournalCommentsPopup.jsx",
  "src/components/JournalNotesPanel.jsx",
]) {
  assert.ok(exists(path), `missing component: ${path}`);
  assert.match(read(path), /export default function/, `${path} must default-export a component`);
}

// Old components removed.
for (const path of [
  "src/components/JournalCurrentPanel.jsx",
  "src/components/JournalChecklistPanel.jsx",
  "src/components/JournalFeed.jsx",
  "src/components/JournalItemCard.jsx",
  "src/components/JournalComments.jsx",
  "src/components/AdminJournalTemplatePanel.jsx",
]) {
  assert.ok(!exists(path), `removed component should not exist: ${path}`);
}

// Section wires the new pieces.
const section = read("src/sections/Journal.jsx");
assert.match(section, /JournalSummary/);
assert.match(section, /JournalBoard/);
assert.match(section, /JournalCommentsPopup/);
assert.match(section, /JournalNotesPanel/);
assert.doesNotMatch(section, /JournalCurrentPanel/);
assert.doesNotMatch(section, /JournalChecklistPanel/);
assert.doesNotMatch(section, /JournalFeed/);
assert.doesNotMatch(section, /JournalItemCard/);
assert.doesNotMatch(section, /initializeJournalChecklist/);

// Editor accepts initialStatus.
assert.match(read("src/components/JournalItemEditor.jsx"), /initialStatus/);

// Rules helpers exist.
const rules = read("src/utils/journalRules.js");
assert.match(rules, /export const BOARD_STATUSES/);
assert.match(rules, /export const isOnBoard/);
assert.match(rules, /export const isInNotesPanel/);
assert.match(rules, /export const summarizeJournalItems/);
assert.match(rules, /export const matchesAssigneeFilter/);

// Admin panel no longer imports the checklist template.
const admin = read("src/components/AdminSectionPanel.jsx");
assert.doesNotMatch(admin, /AdminJournalTemplatePanel/);

// journalApi no longer ships checklist-template helpers.
const api = read("src/utils/journalApi.js");
assert.doesNotMatch(api, /initializeJournalChecklist/);
assert.doesNotMatch(api, /fetchJournalTemplate/);
assert.doesNotMatch(api, /createJournalTemplateItem/);
assert.doesNotMatch(api, /updateJournalTemplateItem/);
assert.doesNotMatch(api, /deleteJournalTemplateItem/);

console.log("journal kanban static ok");
```

- [ ] **Step 2: Register the script**

In `package.json`, find the existing `"verify:journal-frontend-static"` line and add directly after it:

```json
    "verify:journal-kanban-static": "node scripts/verifyJournalKanbanStatic.mjs",
```

Remove this line entirely (in the same edit):

```json
    "verify:journal-checklist": "node scripts/verifyJournalChecklist.mjs",
```

- [ ] **Step 3: Run the verifier; expect failure (Tasks 11/12 not done yet)**

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-kanban-static
```

Expected: fail on removed old components (`JournalCurrentPanel.jsx` etc. still exist), and on `journalApi.js` still containing checklist exports. Tasks 11–12 will resolve these.

- [ ] **Step 4: Commit**

```bash
git add scripts/verifyJournalKanbanStatic.mjs package.json
git commit -m "feat: add journal-kanban static verifier and drop checklist script"
```

---

### Task 11: Delete old frontend components and checklist API client

**Files:**
- Delete: `src/components/JournalCurrentPanel.jsx`
- Delete: `src/components/JournalChecklistPanel.jsx`
- Delete: `src/components/JournalFeed.jsx`
- Delete: `src/components/JournalItemCard.jsx`
- Delete: `src/components/JournalComments.jsx`
- Delete: `src/components/AdminJournalTemplatePanel.jsx`
- Delete: `scripts/verifyJournalChecklist.mjs`
- Modify: `src/components/AdminSectionPanel.jsx`
- Modify: `src/utils/journalApi.js`

- [ ] **Step 1: Delete the obsolete files**

Run:

```bash
git rm src/components/JournalCurrentPanel.jsx \
  src/components/JournalChecklistPanel.jsx \
  src/components/JournalFeed.jsx \
  src/components/JournalItemCard.jsx \
  src/components/JournalComments.jsx \
  src/components/AdminJournalTemplatePanel.jsx \
  scripts/verifyJournalChecklist.mjs
```

- [ ] **Step 2: Remove admin panel import and usage**

In `src/components/AdminSectionPanel.jsx`:

1. Delete the line `import AdminJournalTemplatePanel from "./AdminJournalTemplatePanel";` (around line 24).
2. Delete the JSX element `<AdminJournalTemplatePanel />` (around line 1416). If it sits inside a wrapping `<>...</>` or `<div>` that now becomes empty/redundant, leave the wrapper in place — do not restructure adjacent admin sections.

- [ ] **Step 3: Strip checklist helpers from journalApi**

In `src/utils/journalApi.js`, delete the following exported helpers entirely:

```js
export const initializeJournalChecklist = ...
export const fetchJournalTemplate = ...
export const createJournalTemplateItem = ...
export const updateJournalTemplateItem = ...
export const deleteJournalTemplateItem = ...
```

Keep `fetchJournal`, `createJournalItem`, `updateJournalItem`, `deleteJournalItem`, `createJournalComment`, `fetchJournalBadges`.

- [ ] **Step 4: Verify frontend build and static checks**

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-kanban-static
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-frontend-static
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-rules
```

Expected:
- `npm run build` succeeds.
- `verify:journal-kanban-static` prints `journal kanban static ok`.
- `verify:journal-frontend-static` prints `journal frontend static ok` (unchanged from before — it only checks `journalApi`/`DashboardContext`/`SidebarClientPicker`/`JournalBadge`).
- `verify:journal-rules` prints `journal rules ok`.

- [ ] **Step 5: Commit**

```bash
git add src/components/AdminSectionPanel.jsx src/utils/journalApi.js
git commit -m "chore: remove obsolete journal frontend components and checklist API"
```

---

### Task 12: Remove server-side checklist subsystem and schema

**Files:**
- Modify: `server/services/db.js`
- Modify: `server/services/journalStore.js`
- Modify: `server/routes/journal.js`

- [ ] **Step 1: Strip the checklist routes**

In `server/routes/journal.js`, delete all four checklist routes:

- `router.get("/admin/journal/checklist-template", ...)`
- `router.post("/admin/journal/checklist-template", ...)`
- `router.patch("/admin/journal/checklist-template/:id", ...)`
- `router.delete("/admin/journal/checklist-template/:id", ...)`
- `router.post("/clients/:clientId/journal/stages/:stageId/checklist/initialize", ...)`

Remove the now-unused imports at the top of the file:

```js
  listJournalTemplateItems,
  upsertJournalTemplateItem,
  deleteJournalTemplateItem,
  initializeStageChecklist,
```

- [ ] **Step 2: Strip the store**

In `server/services/journalStore.js`:

1. Remove the `JOURNAL_DEFAULT_TEMPLATE_TITLES` destructure from `require("./db")` — change the line to:

```js
const { pool } = require("./db");
```

2. Delete the functions `listJournalTemplateItems`, `upsertJournalTemplateItem`, `deleteJournalTemplateItem`, `initializeStageChecklist` (entire bodies).
3. In `createJournalItem`, remove the `source_template_item_id` column from the `INSERT` and the corresponding `payload.sourceTemplateItemId` / `item.sourceTemplateItemId` value. The new SQL is:

```js
  const res = await pool.query(
    `INSERT INTO journal_items
      (client_id, stage_id, type, title, description, status, due_date, due_time,
       assignee_user_id, is_team_task, priority, created_by, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      payload.clientId,
      toIntOrNull(payload.stageId),
      item.type,
      item.title,
      item.description,
      item.status,
      item.dueDate,
      item.dueTime,
      item.assigneeUserId,
      item.isTeamTask,
      item.priority,
      toIntOrNull(payload.createdBy),
      JSON.stringify(item.metadata),
    ]
  );
```

In `normalizeItemInput`, delete the line that produces `sourceTemplateItemId`:

```js
    sourceTemplateItemId: toIntOrNull(payload.sourceTemplateItemId),
```

In `rowToItem`, delete the line:

```js
  sourceTemplateItemId: row.source_template_item_id,
```

4. Remove the corresponding entries from `module.exports`. The final exports block keeps these only:

```js
module.exports = {
  createJournalItem,
  listJournalItems,
  countJournalBadgesForUser,
  recordJournalNotificationDelivery,
  wasJournalNotificationDelivered,
  getJournalItemById,
  updateJournalItem,
  softDeleteJournalItem,
  createJournalComment,
  backfillLegacyJournalEntries,
};
```

- [ ] **Step 3: Strip checklist schema from `initSchema` and add one-time drop migration**

In `server/services/db.js`:

1. Remove the constant `JOURNAL_DEFAULT_TEMPLATE_TITLES` and the function `seedJournalChecklistTemplate` (top of file). Remove `JOURNAL_DEFAULT_TEMPLATE_TITLES` from `module.exports` at the bottom of the file.
2. In `initSchema`, delete the entire `CREATE TABLE IF NOT EXISTS journal_checklist_template_items (...)` block from the journal DDL string.
3. In the `journal_items` DDL, delete the column line:

```sql
      source_template_item_id INTEGER REFERENCES journal_checklist_template_items(id) ON DELETE SET NULL,
```

4. Delete the call `await seedJournalChecklistTemplate();`.
5. Immediately after the journal DDL `pool.query` call (and before the existing `// Forward-compatible column migrations` block), add an idempotent drop migration that cleans up local installations that already created the table or column. We guard the `source_template_item_id` reference behind an `information_schema` lookup because Postgres's parser validates every column name in a query at parse time — a single statement that mentions a nonexistent column will fail even with an EXISTS guard. Use this two-step form:

```js
  // One-time cleanup: journal checklist subsystem was removed in 2026-05-28.
  const colExistsRes = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_items' AND column_name = 'source_template_item_id'
    LIMIT 1
  `);
  if (colExistsRes.rowCount > 0) {
    await pool.query(`
      DELETE FROM journal_items
      WHERE source_template_item_id IS NOT NULL
         OR metadata_json LIKE '%"checklist":true%'
    `);
    await pool.query(`ALTER TABLE journal_items DROP COLUMN IF EXISTS source_template_item_id`);
  } else {
    await pool.query(`
      DELETE FROM journal_items
      WHERE metadata_json LIKE '%"checklist":true%'
    `);
  }
  await pool.query(`DROP TABLE IF EXISTS journal_checklist_template_items`);
```

- [ ] **Step 4: Run the server smoke and confirm it still passes**

```bash
cd server && PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run smoke:journal-store
```

Expected: prints `journal store ok` (the existing smoke does not reference checklist functions; if it does, also delete those references in the smoke before running — the smoke is at `server/scripts/smokeJournalStore.js` and was created earlier in the journal-crm plan; remove any `listJournalTemplateItems` import and the assertion `assert.equal(template.length, JOURNAL_DEFAULT_TEMPLATE_TITLES.length);` if present).

If the journal-crm smoke imports `JOURNAL_DEFAULT_TEMPLATE_TITLES` or `listJournalTemplateItems`, edit `server/scripts/smokeJournalStore.js` to:

1. Remove those imports from the destructured `require("../services/journalStore")` call.
2. Remove the related `await listJournalTemplateItems(...)` block.

Re-run the smoke and confirm it passes.

- [ ] **Step 5: Run the journal API verifier**

If you have a local server and env vars (`JOURNAL_TEST_TOKEN`, `JOURNAL_TEST_CLIENT_ID`, `JOURNAL_TEST_STAGE_ID`) configured:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-api
```

Expected: `journal api ok` (unchanged endpoints).

If env vars are not configured, skip and note in commit message.

- [ ] **Step 6: Commit**

```bash
git add server/services/db.js server/services/journalStore.js server/routes/journal.js server/scripts/smokeJournalStore.js
git commit -m "chore: remove journal checklist subsystem from server"
```

---

### Task 13: Manual UAT and final build verification

**Files:** (none modified)

- [ ] **Step 1: Full build**

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 2: All journal verifiers**

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-rules
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-kanban-static
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run verify:journal-frontend-static
```

Expected: each prints `... ok`.

- [ ] **Step 3: Manual UAT (run dev server locally)**

Start the app:

```bash
PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm run dev
# in another terminal:
cd server && PATH="/opt/homebrew/bin:$HOME/.bun/bin:$PATH" npm start
```

Open the dashboard, sign in as an employee with `journal.write`, pick a client with at least one stage. Run through the following checklist:

- [ ] Summary strip shows three numbers; numbers update correctly when statuses change or due dates pass.
- [ ] Filter bar:
  - [ ] Default `Этап = Все`, `Исполнитель = Мои + команда`, `Тип = Все`.
  - [ ] Changing `Этап` filters cards across all columns.
  - [ ] Changing `Исполнитель` filters cards across all columns (`Мои` removes team-only items, `Команды` removes personal items, `Все` shows everything).
  - [ ] Changing `Тип` to `События` removes tasks.
- [ ] Board:
  - [ ] Four columns render with counts.
  - [ ] `cancelled` items appear in `Готово` with a grey `отменено` tag.
  - [ ] Card shows: type+stage tag, urgency indicator if applicable, title (2 lines), description (1 line, with tooltip on hover), due date+time, assignee (`👥` for team or `#ID`), `💬 N`.
  - [ ] High-priority cards have a red left border.
- [ ] D&D:
  - [ ] Drag a card from `Открыто` to `В работе` — card moves and after refresh stays in `В работе`.
  - [ ] Drag a card to `Готово` — `completedAt` is set (visible in DB or via editor).
  - [ ] Drop on same column does nothing.
  - [ ] If the server returns an error (simulate by temporarily disconnecting backend), the alert appears and the board reloads to truth.
- [ ] `⋯` menu on a card lists all four target statuses plus `Отменить`; clicking a different status moves the card without dragging.
- [ ] Click `💬` icon on a card → popup opens anchored below the card.
  - [ ] Popup lists existing comments with `#authorId · DD.MM HH:MM`.
  - [ ] Cmd/Ctrl+Enter submits the composer.
  - [ ] Esc closes the popup.
  - [ ] Click outside closes the popup.
- [ ] `+` button in a column header opens the editor pre-set with that status.
- [ ] `+ Задача` button creates a task with status `open`; if a specific stage is filtered, the editor's stage select reflects it.
- [ ] Notes panel:
  - [ ] Collapsed by default; expand shows notes sorted by date desc.
  - [ ] `+ Добавить заметку` opens the editor in note mode.
  - [ ] `→ задача` on a note creates a card on the board with the note text in the description; the note row gets `🔗`.
  - [ ] `×` on a note prompts to confirm and deletes the note.
- [ ] Reload the page → state persists.
- [ ] Toggle dark theme via the existing theme switch → board, card borders, summary cells, popup all remain readable.
- [ ] Open the Admin panel as admin → the old "Journal checklist template" section is gone; other admin sections are intact.

- [ ] **Step 4: Verify no DB residue**

Connect to the local Postgres:

```bash
psql "$DATABASE_URL" -c "\d journal_items" -c "SELECT to_regclass('public.journal_checklist_template_items') AS table_exists"
```

Expected:
- `journal_items` schema listing does NOT include a `source_template_item_id` column.
- `table_exists` is `(null)` — table is dropped.

- [ ] **Step 5: Final commit (only if any minor doc/style touch-ups land during UAT)**

If you discovered nothing to fix, skip this step. Otherwise:

```bash
git add -A
git commit -m "chore: post-UAT polish for journal kanban"
```

---

## Self-Review Notes

**Spec coverage:**
- Summary strip → Task 3.
- Filter bar → Task 7 (`JournalBoard`).
- 4 columns + cancelled-in-done → Tasks 6, 7.
- Card content + urgency + priority border + footer → Task 5.
- Comments popup with anchor and Esc/outside-close → Task 4.
- D&D with optimistic update + rollback → Tasks 5, 6, 7, 9.
- Accessibility `⋯ Move to →` fallback → Task 5.
- Notes panel + quote-into-task + delete → Tasks 8, 9.
- Editor `initialStatus` → Task 2.
- Rules helpers + verifier → Task 1.
- Static verifier → Task 10.
- Delete obsolete frontend → Task 11.
- Delete server checklist + drop schema → Task 12.
- Full UAT + verifier sweep → Task 13.

**Type/name consistency check:**
- `onDropCard` signature in `JournalColumn` (`{ id, fromStatus, toStatus }`) matches `onDropItem` in `JournalBoard` and `handleDrop` in `Journal.jsx`.
- `onMove` on card → `onCardMove` on column → `onMoveItem` on board → `handleMove` in section, all take `(item, status)`.
- `onCommentClick(item, anchorRect)` consistent across card → column → board → section.
- `onCreateItem({ type, status, stageId })` consistent on board → section.
- `BOARD_STATUSES` defined once in `journalRules.js`, consumed by `JournalCard` (move menu) and `JournalBoard` (column rendering).
