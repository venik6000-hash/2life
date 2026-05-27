# CRM Journal Design

**Date:** 2026-05-27
**Status:** Approved design, awaiting written spec review
**Scope:** Turn the existing employee-only "Журнал" placeholder into a client-level CRM journal for tasks, events, notes, stage checklists, comments, reminders, browser push notifications, and red client-list badges.

---

## 1. Goals

1. Make "Журнал" a full employee CRM workspace inside the selected client card.
2. Show one cross-stage journal for the client, similar in scope to analytics being visible across stages.
3. Support tasks, events, notes, checklist items, and comments from doctors and nutritionists.
4. Add reminders through browser push notifications and visible red badges in the client list.
5. Keep the first release focused on the client card, without a global all-clients work queue.

## 2. Non-Goals

- Client-facing journal access.
- A global "work day" or kanban view across all clients.
- Automatic creation or closing of journal tasks from analytics, lab order, protocol, nutrition, messenger, or other sections.
- Recurring tasks.
- Advanced reminder rules such as "notify 2 hours before".
- Multiple checklist templates per stage type.

## 3. Current State

The current `JournalSection` stores simple records inside `stages[*].journal`:

```js
{ date, type, text, author }
```

These records are saved through the general `PATCH /api/clients/:clientId` flow. The database already has `journal_entries`, but it represents the same simple per-stage note model. It does not support cross-stage CRM behavior, statuses, assignees, due dates, comments, reminders, or client-list counters.

The project already has:

- client and stage access control;
- section permissions including `journal`;
- doctor/user assignments;
- Web Push infrastructure for messenger devices;
- a service worker that handles push notifications;
- `activity_log` for durable audit-style activity.

## 4. Recommended Approach

Use a dedicated CRM journal model owned by the client, with optional links to stages.

The journal is cross-stage at the client level. Stage links are metadata and filters, not storage boundaries. This keeps the UI aligned with employee workflow: "what needs to happen for this client now?" while still preserving stage context.

## 5. Domain Model

### 5.1 Journal Item

A journal item is the main record. It has one of three types:

- `task` — an employee action to complete.
- `event` — a meeting, call, control date, lab submission, medication start check, or other scheduled point.
- `note` — a free-form employee note or medical/team comment without required due date.

Shared fields:

- `id`
- `client_id`
- optional `stage_id`
- `type`
- `title`
- `description`
- `status`
- `due_date`
- optional `due_time`
- optional `assignee_user_id`
- `is_team_task`
- `priority`
- `created_by`
- `created_at`
- `updated_at`
- optional `completed_at`
- optional `cancelled_at`
- optional `source_template_item_id`
- optional `deleted_at`
- optional `deleted_by`
- optional `delete_reason`
- `metadata_json`

### 5.2 Statuses

Tasks and events use the same statuses:

- `open` — open.
- `in_progress` — in progress.
- `waiting_client` — waiting for client.
- `done` — completed.
- `cancelled` — cancelled.

`open`, `in_progress`, and `waiting_client` are open statuses. `done` and `cancelled` are terminal statuses.

Notes do not need workflow statuses.

### 5.3 Comments

Comments belong to a journal item. They store:

- `id`
- `journal_item_id`
- `author_user_id`
- `body`
- `created_at`
- `updated_at`

Doctors and nutritionists can leave both:

- standalone journal notes;
- threaded comments inside a specific task, event, or checklist item.

### 5.4 Checklist Template

Admins manage a global checklist template in the admin section.

Default active items:

1. Отправить клиента в лабораторию / выдать список анализов.
2. Проконтролировать сдачу анализов.
3. Проверить, что файлы анализов загружены.
4. Подготовить/обновить протокол.
5. Отправить протокол клиенту.
6. Подготовить/обновить питание.
7. Отправить рекомендации по питанию.
8. Уточнить, начал ли клиент принимать препараты.
9. Назначить промежуточную встречу/созвон.
10. Зафиксировать комментарии врача/нутрициолога по этапу.
11. Закрыть этап / назначить следующий шаг.

Template item fields:

- `id`
- `title`
- `sort_order`
- `active`
- `created_at`
- `updated_at`

Admins can add, remove, rename, reorder, and deactivate template items.

### 5.5 Checklist Instances

For a client stage, active template items become local checklist item instances. A checklist item instance is stored as a `task` journal item with `source_template_item_id`.

Employees can locally add or remove checklist items for a specific client/stage. Local changes do not mutate the global template.

Template changes affect only new or not-yet-initialized stage checklists. They must not rewrite already created client checklist items.

## 6. UI Design

The Journal section inside a client card has one CRM screen.

### 6.1 Current Block

At the top, show "Актуальное":

- overdue open tasks/events;
- today's open tasks/events;
- nearest future tasks/events;
- quick actions to add a task, event, or note.

### 6.2 Stage Checklists

Show "Чек-листы по этапам" below the current block.

Each client stage is a group. Inside a stage group, employees can:

- see checklist items created from the global template;
- add a local checklist item;
- delete a local or irrelevant item;
- set status;
- set due date and optional time;
- set assignee or leave as team-wide;
- open and add comments.

### 6.3 Feed

Show a cross-stage feed below the checklist area.

The feed contains tasks, events, notes, and visible comment summaries in reverse chronological order.

Filters:

- all / tasks / events / notes;
- open / completed;
- stage;
- assignee.

Task and event cards should show the latest comment preview without forcing the employee to open every item.

### 6.4 Client List Badge

The client list shows a red badge next to each client.

Badge count = open tasks and events where:

- `due_date` is today or earlier;
- status is `open`, `in_progress`, or `waiting_client`;
- item is assigned to the current employee or left as a team task;
- the current employee has access to the client.

Do not count:

- future items;
- notes;
- `done` items;
- `cancelled` items;
- items assigned to another specific employee.

## 7. Notifications

Reuse the existing Web Push infrastructure used by messenger:

- VAPID configuration;
- registered browser devices;
- service worker push handling.

Journal must not create a second push subscription system.

### 7.1 Morning Digest

Each morning, send one push to each employee with the count of their relevant open tasks/events for today and overdue items across accessible clients.

The digest opens the dashboard. The employee then sees red badges in the client list.

### 7.2 Exact-Time Reminders

If a task/event has both `due_date` and `due_time`, send a push when that time arrives.

Clicking the push opens the relevant client in the Journal section.

### 7.3 Deduplication

Store sent notification facts:

- digest: user + date;
- exact reminder: journal item + user + scheduled date/time.

This prevents duplicate notifications if the scheduler restarts.

If push is not configured or the browser permission is denied, the Journal still works. Badges and in-app data are the primary signal.

## 8. Permissions

- Client role must not see the Journal section and must not receive journal data.
- `journal.read` allows reading journal items, comments, checklists, and badge counts for accessible clients.
- `journal.write` allows creating and updating tasks, events, notes, comments, statuses, due dates, assignees, and local checklist items.
- Admin-only access controls the global checklist template.
- Badge counts must be scoped to clients the current user can access.
- If an assignee loses access to a client, show "ответственный недоступен" to employees/admins who can still access the client and allow reassignment.

## 9. API And Storage Shape

Add dedicated journal endpoints instead of continuing to overload `PATCH /api/clients/:clientId`.

Endpoints:

- `GET /api/clients/:clientId/journal`
- `POST /api/clients/:clientId/journal/items`
- `PATCH /api/clients/:clientId/journal/items/:itemId`
- `DELETE /api/clients/:clientId/journal/items/:itemId`
- `POST /api/clients/:clientId/journal/items/:itemId/comments`
- `PATCH /api/clients/:clientId/journal/comments/:commentId`
- `DELETE /api/clients/:clientId/journal/comments/:commentId`
- `POST /api/clients/:clientId/journal/stages/:stageId/checklist/initialize`
- `GET /api/journal/badges`
- admin template endpoints under `/api/admin/journal/checklist-template`

Tables:

- `journal_items`
- `journal_comments`
- `journal_checklist_template_items`
- `journal_notification_deliveries`

The existing `journal_entries` table should be migrated into `journal_items` as `note` records. Keep the legacy table during transition if needed, but new UI and API should read from the new model.

## 10. Migration

For every existing `journal_entries` row:

- create a `journal_items` row with `type = 'note'`;
- preserve `client_id`;
- map the old stage DB id to the new item `stage_id`;
- preserve `date`, `author`, and `text`;
- store the old `type` in `metadata_json.legacy_type`;
- set `created_at` from parsed date when safe, otherwise use migration time.

The migration must be additive and safe for existing client data. It must not delete old journal entries in the first release.

## 11. Error And Empty States

- Empty journal: show a calm empty state with buttons to add task, event, or note.
- Push not configured: show notification status, but do not block Journal usage.
- Browser notifications denied: show a non-blocking status with a way to retry after browser permission changes.
- Read-only user: render Journal without mutation controls.
- Missing assignee access: show "ответственный недоступен" and allow reassignment for users with write access.

## 12. Acceptance Criteria

The first release is complete when:

1. Employees can see one cross-stage Journal inside the selected client card.
2. Employees can create and edit tasks, events, notes, and comments according to `journal.write`.
3. Stage checklists initialize from the global admin template and remain locally editable.
4. Client list badges correctly count current employee + team open tasks/events that are due today or overdue.
5. Browser push sends a morning digest and exact-time reminders without duplicates when push is configured.
6. Client role cannot see Journal navigation, Journal data, badge data, or Journal notifications.
7. Old simple journal entries are visible as migrated notes.

## 13. Validation Plan

Primary checks:

- create task/event/note/comment in one client and confirm they appear in the cross-stage Journal;
- create multiple stages and confirm one Journal shows all stage-linked items;
- initialize checklist from the admin template and locally add/delete items;
- verify badge count for today, overdue, future, done, cancelled, my, team, and other-assignee cases;
- confirm client users cannot access Journal endpoints;
- simulate scheduler twice and confirm push delivery facts prevent duplicate notifications.

Secondary checks:

- server route tests or focused smoke scripts for badge counts and permission boundaries;
- frontend smoke for Journal empty state, read-only mode, and basic mutation flow;
- architecture documentation update for the new Journal model and endpoint mapping.

## 14. Documentation Updates

Update `ARCHITECTURE.md` after implementation to reflect:

- new journal tables;
- new journal API routes;
- changed Section -> API mapping for `journal`;
- browser push reuse beyond messenger;
- migration behavior from legacy `journal_entries`.

## 15. Suggested Implementation Order

1. Add storage schema and migration/backfill from legacy entries.
2. Add journal API routes and permission checks.
3. Add badge count endpoint and client-list display.
4. Add admin checklist template management.
5. Build Journal UI: current block, stage checklists, feed, comments.
6. Extend push delivery for digest and exact-time reminders.
7. Update documentation and focused validation scripts.
