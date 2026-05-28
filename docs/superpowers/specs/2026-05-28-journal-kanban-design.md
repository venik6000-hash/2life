# Journal Kanban Redesign — Design Spec

**Date:** 2026-05-28
**Status:** Approved design, ready for implementation plan
**Supersedes (partially):** UI layer of `2026-05-27-journal-crm-design.md` (server, schema, badges, push, permissions remain unchanged).

---

## Problem

The current Journal section renders three stacked panels (`JournalCurrentPanel` + `JournalChecklistPanel` + `JournalFeed`). At a real client with one or two initialized stages, this becomes a long vertical wall of cards: 11 checklist items per stage rendered as full task cards, mixed with real tasks, events, and free-form notes, all using the same heavy `JournalItemCard`. Filtering helps but does not solve the underlying UX problem: an employee cannot see the state of the client's open work at a glance, cannot quickly move work forward, and cannot triage what is overdue.

## Goal

Replace the journal UI with a **Kanban-style board** scoped to the selected client. The board makes the employee's day-to-day workflow visible (what to do, what's in progress, what's blocked, what's done), supports fast status changes through drag-and-drop, and removes the "wall of text" by removing two sources of bulk: per-stage checklists (deleted) and free-form notes (moved off the board into a separate collapsed feed).

## Non-Goals

- Server-side data model changes for tasks/events/notes, badges, push reminders, permissions, or admin checklist template UI. The `journal_items` and `journal_comments` schema stays as-is.
- New filtering primitives (we reuse stage/type filters from current code, add assignee filter).
- Mobile-first redesign. The board is desktop-first; mobile fallback is "stacked columns" but is not a goal of this spec.
- Calendar view of events. Events live on the board with tasks.

## Scope Check

This is a single, focused frontend redesign of one section. It does not span subsystems, does not need to be decomposed.

---

## Layout

Top to bottom inside `JournalSection`:

```
┌─ Summary strip (3 numbers) ────────────────────────────────────┐
│ Открытых: 12     На сегодня: 3      Просрочено: 2              │
└────────────────────────────────────────────────────────────────┘

┌─ Filter bar ───────────────────────────────────────────────────┐
│ Этап: [Все ▾]   Исполнитель: [Мои + команда ▾]                 │
│ Тип: [Все ▾]                                  [+ Задача]       │
└────────────────────────────────────────────────────────────────┘

┌─ Kanban board (4 columns) ─────────────────────────────────────┐
│ К работе (4) │ В работе (3) │ Ждём кл. (2) │ Готово (8)        │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐     │
│ │ card     │ │ │ card     │ │ │ card     │ │ │ card     │     │
│ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────┘     │
│ ┌──────────┐ │ ┌──────────┐ │              │ ┌──────────┐     │
│ │ card     │ │ │ card     │ │              │ │ card     │     │
│ └──────────┘ │ └──────────┘ │              │ └──────────┘     │
│ [+]          │ [+]          │ [+]          │                   │
└────────────────────────────────────────────────────────────────┘

┌─ Notes panel (collapsed by default) ───────────────────────────┐
│ ▸ Заметки · 5                                [+ Добавить]      │
└────────────────────────────────────────────────────────────────┘
```

## Columns

Four columns, one per status:

| Column | Status value |
|--------|--------------|
| К работе | `open` |
| В работе | `in_progress` |
| Ждём клиента | `waiting_client` |
| Готово | `done` |

`cancelled` items render inside the **Готово** column with a small grey "отменено" tag on the card, no separate column. The column header shows `(N)` — the count of cards visible after filters. Each column has a `[+]` button in the header that opens the editor pre-set to that column's status.

## Card

A card is compact, ~120-140px tall. Layout:

```
┌─ left border = priority ─────────────────────────────┐
│ ЗАДАЧА · Этап 2                       🔴 просрочено  │
│                                                      │
│ Подготовить протокол по итогам анализов              │
│                                                      │
│ Описание в одну строку, обрезается…                  │
│                                                      │
│ 📅 28.05 · 15:00      👤 АН      💬 3                │
└──────────────────────────────────────────────────────┘
```

Fields:

- **Left border colour** = priority. `high` → red. `normal`/`low` → neutral border, same as card border.
- **Type · Stage tag** (top): `ЗАДАЧА`/`СОБЫТИЕ`, coloured by type (reuse current `typeTone`). Stage label appended (`Этап 2`). If `stageId == null` → just type.
- **Urgency indicator** (top right): 🔴 `просрочено` when `dueDate < today` and status is open-ish, 🟡 `сегодня` when `dueDate == today`, otherwise empty. `cancelled` shows a grey "отменено" tag instead.
- **Title**: 14-15px, font-weight 600, max 2 lines, ellipsis after.
- **Description**: optional, 12px, 1 line, ellipsis. Skipped if empty.
- **Footer row**: due `📅 DD.MM · HH:MM` (HH:MM optional); assignee — avatar/initials, or 👥 if `isTeamTask`; `💬 N` only when comments exist.

Interactions:

- **Click card (anywhere except footer icons)** → opens `JournalItemEditor` modal (unchanged behaviour).
- **Click `💬 N` icon** → opens `JournalCommentsPopup` anchored to the card. Popup is small (~320px wide): scrollable list of comments showing `автор · DD.MM HH:MM`, body below, newest at bottom, inline composer at the bottom. Closes on outside click or `Esc`. Adding a comment uses existing `createJournalComment` API.
- **Drag** → see Drag-and-drop section.

## Drag and Drop

Reuse the existing native HTML5 pattern from `src/sections/LabOrder.jsx` + `src/components/LabOrderGroupCard.jsx`. No new library.

- Card sets `draggable=true`. `onDragStart` puts `{ type: "journal-item", id, fromStatus }` into `dataTransfer.setData("application/json", ...)`. Card sets a `data-dragging` flag so styling can dim it.
- Column container is the drop zone: `onDragOver` calls `e.preventDefault()` and toggles a highlight class. `onDragLeave` removes it. `onDrop` parses the payload, ignores drops from the same status, otherwise calls `updateJournalItem(authFetch, clientId, id, { status: toStatus })`.
- On drop into `done`, the server already sets `completedAt = now` (no client change needed).
- During the update request the card stays optimistically in the new column. On error, snap back to the original column and toast the error (existing pattern in the app).
- D&D is not bound to any specific item field besides status — no reordering inside a column in v1.

Accessibility fallback: footer of the card has a small caret-menu `⋯` exposing the same "Move to → К работе / В работе / Ждём кл. / Готово / Отменить" actions, so keyboard users do not need to drag.

## Filters and Summary

Filter bar above the board:

- **Этап** — `Все / Без этапа / Этап N` for each stage. Default `Все`.
- **Исполнитель** — `Мои / Команды / Мои + команда / Все`. Default `Мои + команда` (matches the badge logic on the sidebar). Client-side filter against `assigneeUserId` and `isTeamTask`.
- **Тип** — `Все / Задачи / События`. Default `Все`. (Notes are not on the board.)
- **`[+ Задача]`** in the right of the bar — opens `JournalItemEditor` for a new task with sensible defaults (`status=open`, `stageId` from the Этап filter if set, otherwise current stage of the client).

Summary strip above the filters is a one-line three-number row, derived purely from the loaded `items`:

- **Открытых** — count where `type in {task,event}` and `status in {open, in_progress, waiting_client}`.
- **На сегодня** — open items with `dueDate == today`.
- **Просрочено** — open items with `dueDate < today`.

No new endpoint — same loaded `items` array as today.

## Notes Panel

Below the board, a collapsed `▸ Заметки · N` strip. Expanded:

- Vertical flat list of notes (`type === "note"`), newest first.
- Each row: `DD.MM · автор · текст` with stage tag if `stageId` set. Click row → opens editor for that note. Hover shows delete `×`.
- Inline `[+ Добавить заметку]` button opens the editor in note mode (existing flow, `type=note`).
- "Quote into task" is a row-level action `→ задача` that creates a new task on the board prefilled with `description = "<note text>"`, `stageId` matching the note, and writes back `metadata.quotedFromNoteId = note.id`. The note row gets a small 🔗 indicator when it has been quoted at least once. **In scope for v1.**

The notes panel is the only place notes are visible. They do not appear on the board, even after being checked off.

## Removed Features

The checklist subsystem is removed in full:

**Frontend (delete):**
- `src/components/JournalChecklistPanel.jsx`
- `isChecklistItem`, `onInitialize`, `initChecklist`, `currentItems` panel logic in `src/sections/Journal.jsx`
- Imports of `JournalCurrentPanel`, `JournalChecklistPanel`, `JournalFeed`, `JournalItemCard` from `Journal.jsx` (replaced by new components)

**Backend (delete):**
- Table `journal_checklist_template_items` DDL in `server/services/db.js` and seed `seedJournalChecklistTemplate`
- Exports `JOURNAL_DEFAULT_TEMPLATE_TITLES`, `listJournalTemplateItems`, `upsertJournalTemplateItem`, `deleteJournalTemplateItem`, `initializeStageChecklist` in `server/services/journalStore.js`
- Routes `/admin/journal/checklist-template*`, `/clients/:clientId/journal/stages/:stageId/checklist/initialize` in `server/routes/journal.js`
- Admin checklist template UI (if added by the journal-crm plan)
- Verify scripts: `scripts/verifyJournalChecklist.mjs`

**Local DB cleanup** (test data only, prod confirmed clean — no journal CRM deployed on VPS as of 2026-05-28):

```sql
DELETE FROM journal_items
WHERE source_template_item_id IS NOT NULL
   OR metadata_json::text LIKE '%"checklist":true%';
DROP TABLE IF EXISTS journal_checklist_template_items;
```

Column `journal_items.source_template_item_id` becomes vestigial. Drop the column too (additive migration in `initSchema` is local-only; on fresh DBs the column will simply not be created after the DDL change).

The legacy `journal_entries` table and `backfillLegacyJournalEntries` stay (separate concern, not about the checklist).

## Components

| Component | Role | Status |
|-----------|------|--------|
| `src/sections/Journal.jsx` | Container: fetch, state, filters, prop-drilling | rewrite |
| `src/components/JournalSummary.jsx` | Three-number summary strip | new |
| `src/components/JournalBoard.jsx` | Board: columns + D&D wiring + filter bar | new |
| `src/components/JournalColumn.jsx` | One column: header, list of cards, drop zone, `+` | new |
| `src/components/JournalCard.jsx` | Compact card | new |
| `src/components/JournalCommentsPopup.jsx` | Inline comments popup | new |
| `src/components/JournalNotesPanel.jsx` | Collapsed notes feed | new |
| `src/components/JournalItemEditor.jsx` | Modal create/edit (existing) | keep, minor edits |
| `src/components/JournalCurrentPanel.jsx` | Old "Актуальное" panel | **delete** |
| `src/components/JournalChecklistPanel.jsx` | Old per-stage checklist panel | **delete** |
| `src/components/JournalFeed.jsx` | Old vertical feed | **delete** |
| `src/components/JournalItemCard.jsx` | Old heavy card | **delete** |

`JournalItemEditor` keeps current API (`stages`, `initialType`, `initialStageId`, `item`, `onClose`, `onSave`). It accepts a new optional `initialStatus` so the column `+` button can pre-select status.

### Component contracts (short)

**`JournalSummary`** — props: `{ items, today }`. Pure render of three counters. Internal logic only.

**`JournalBoard`** — props: `{ items, stages, currentUser, readOnly, onEditItem, onCreateItem, onStatusChange, onCommentClick }`. Owns column filtering by status, renders 4 `JournalColumn`s, owns the filter bar state (stage/assignee/type) and the `[+ Задача]` button. Filters apply to all columns identically.

**`JournalColumn`** — props: `{ status, label, count, items, readOnly, onCardClick, onCardCommentClick, onCreate, onDropCard }`. Renders header, list, drop zone, `+` button. Owns drag highlight state.

**`JournalCard`** — props: `{ item, stages, currentUser, readOnly, onClick, onCommentClick, onMove }`. Owns drag handlers and the accessibility `⋯ Move to →` menu.

**`JournalCommentsPopup`** — props: `{ item, anchorRect, onClose, onAddComment }`. Floating popup, manages own composer state, focus-trap, `Esc` to close.

**`JournalNotesPanel`** — props: `{ notes, stages, readOnly, onEditNote, onAddNote, onQuoteToTask, onDeleteNote }`. Owns collapse state. Internal sort by `createdAt` desc.

## State and Data Flow

`Journal.jsx` continues to own the loaded items array. No new endpoints. After any mutation (create/update/delete/comment/drop):

```
mutation → API call → loadJournal() → re-render
```

Optimistic update on D&D only (snap back on error). Editor and comment popup do full reload to stay simple.

Notes feed and Kanban board read from the same `items` array — partitioned in `Journal.jsx`:

```js
const notes = items.filter(i => i.type === "note");
const board = items.filter(i => i.type === "task" || i.type === "event");
```

`JournalBoard` further partitions `board` by status into the 4 columns.

## Theming and Styling

Reuse existing `useTheme()` palette tokens. The board uses CSS grid `grid-template-columns: repeat(4, 1fr)` with `gap: 12px`. Columns are scrollable independently (`overflow-y: auto`, `max-height: calc(100vh - <header>)`). Card has `border: 1px solid $.brd`, background `$.bgI`, left border priority overrides.

No new global CSS. All styles inline-on-component, consistent with the rest of the codebase.

## Testing

- New shared rule: `isOnBoard(item)` and `isInNotesPanel(item)` predicates added to `src/utils/journalRules.js`. Cover with `scripts/verifyJournalRules.mjs`.
- New rule: `summarizeJournalItems(items, today)` returns `{ open, today, overdue }`. Covered by same script.
- Existing journal rule and API tests continue to pass unchanged.
- Manual UAT (covered in implementation plan): drag a card across each pair of columns, drop into `Готово`, refresh, confirm `completedAt` was set; open and add a comment via the popup; collapse and expand the notes panel; quote a note into a task.

## Risk and Open Questions

- D&D on touch screens: native HTML5 does not handle touch reliably. Acceptable for v1 (employees use desktop); the `⋯ Move to →` menu is the touch fallback.
- The schema change (drop `source_template_item_id`, drop `journal_checklist_template_items`) is destructive but acceptable because prod has neither (origin/main verified 2026-05-28: no `journalStore` or related routes exist on remote).
- The `metadata.quotedFromNoteId` link is one-way (task points to note). If later we want backlinks rendered on the note, add a `quotedTasks` lookup at load time.
