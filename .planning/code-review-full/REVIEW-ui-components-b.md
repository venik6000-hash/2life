---
phase: code-review-full / ui-components-b (N-Z + mobile)
reviewed: 2026-05-19T00:00:00Z
depth: deep
files_reviewed: 60
files_reviewed_list:
  - src/components/NewClientModal.jsx
  - src/components/NewStageModal.jsx
  - src/components/NoClientsScreen.jsx
  - src/components/NutritionCommentCard.jsx
  - src/components/NutritionEmptyCard.jsx
  - src/components/NutritionMaterialModal.jsx
  - src/components/NutritionMaterialsCard.jsx
  - src/components/NutritionProductsCard.jsx
  - src/components/NutritionRecommendationsCard.jsx
  - src/components/NutritionRevisionHeader.jsx
  - src/components/PercentBar.jsx
  - src/components/ProtocolField.jsx
  - src/components/ProtocolRevisionHeader.jsx
  - src/components/ProtocolSheet.jsx
  - src/components/QActivityCard.jsx
  - src/components/QAnamnesCard.jsx
  - src/components/QAppearanceCard.jsx
  - src/components/QCardioCard.jsx
  - src/components/QCommentBlock.jsx
  - src/components/QDataBlock.jsx
  - src/components/QDigestionCard.jsx
  - src/components/QHabitsCard.jsx
  - src/components/QImmuneCard.jsx
  - src/components/QMaleHealthCard.jsx
  - src/components/QMusculoskeletalCard.jsx
  - src/components/QNutritionCard.jsx
  - src/components/QRespiratoryCard.jsx
  - src/components/QSectionCard.jsx
  - src/components/QStressCard.jsx
  - src/components/QWellbeingCard.jsx
  - src/components/QaRow.jsx
  - src/components/QuestionnaireStatusCard.jsx
  - src/components/QuestionnaireWellbeingBlock.jsx
  - src/components/ReadReceipt.jsx
  - src/components/ReadonlyBanner.jsx
  - src/components/RevisionPills.jsx
  - src/components/ScoreBar.jsx
  - src/components/SectionTitle.jsx
  - src/components/SelectInput.jsx
  - src/components/SeverityBadge.jsx
  - src/components/SeverityListCard.jsx
  - src/components/SeveritySelect.jsx
  - src/components/SexEd.jsx
  - src/components/SidebarClientPicker.jsx
  - src/components/SidebarFooter.jsx
  - src/components/SidebarLogoToggle.jsx
  - src/components/SidebarNavItem.jsx
  - src/components/SidebarNavList.jsx
  - src/components/SidebarShell.jsx
  - src/components/SidebarStageList.jsx
  - src/components/StatCard.jsx
  - src/components/StressScale.jsx
  - src/components/TextArea.jsx
  - src/components/Wrapper.jsx
  - src/mobile/MessengerApp.jsx
  - src/mobile/MobileBookmarksScreen.jsx
  - src/mobile/MobileChatList.jsx
  - src/mobile/MobileChatSearchOverlay.jsx
  - src/mobile/MobileChatThread.jsx
  - src/mobile/MobileMessengerSettings.jsx
  - src/mobile/MobileMessengerShell.jsx
  - src/mobile/MobileSearchScreen.jsx
findings:
  blocker: 6
  critical: 6
  warning: 14
  info: 5
  total: 25
status: issues_found
---

# UI Components Review (N-Z + Mobile)

**Reviewed:** 2026-05-19
**Depth:** deep
**Files Reviewed:** 60
**Status:** issues_found

## Summary

Reviewed 60 React UI components (alphabetical N-Z under `src/components/`) and all 8 files under `src/mobile/`. The questionnaire card cluster (Q*) and sidebar primitives are largely defect-free thin presentational wrappers. Material concerns are concentrated in three places:

1. **User-supplied URLs are rendered as `<a href>` without scheme validation**, allowing `javascript:` URL injection in two distinct surfaces (Protocol items, Nutrition materials).
2. **`MobileChatThread.jsx`** has multiple cross-chat state bleed, race-condition, and unmount-safety bugs. The 659-line file concentrates most defects in this batch.
3. **Nested-path state setters** (`QNutritionCard`, `QStressCard`) silently lose writes or crash when a path segment is missing/null.

Mobile components also exhibit unguarded promise destructuring (search overlays) and orphaned long-press timers across all touch surfaces.

## Critical Issues

### CR-01: `javascript:` URL injection in Protocol item link (BLOCKER)

**File:** `src/components/ProtocolSheet.jsx:101-104` (also: input via `prompt()` at line 113)
**Issue:** `record.item.link` is collected via `prompt("Ссылка на магазин:", ...)` and rendered verbatim:
```jsx
<a href={record.item.link} target="_blank" rel="noreferrer" ...>
```
A coach (or anyone with write access to a record) can save `javascript:fetch('/api/secrets').then(...)` and the next viewer who clicks the row will execute attacker JS in the dashboard origin — full session compromise. `rel="noreferrer"` does not block `javascript:`.

**Fix:** Validate scheme before storing and/or rendering. Minimum:
```js
const SAFE = /^(https?:|mailto:|tel:)/i;
const safeLink = SAFE.test(String(record.item.link || "")) ? record.item.link : null;
// then: {safeLink ? <a href={safeLink} ...>...</a> : <span>...</span>}
```
Also reject in the prompt handler at line 113-114.

### CR-02: `javascript:` URL injection in Nutrition material link (BLOCKER)

**File:** `src/components/NutritionMaterialsCard.jsx:28-42`
**Issue:** Same class of bug as CR-01:
```jsx
<a href={material.url || "#"} target="_blank" rel="noreferrer" ...>
```
`material.url` is free-form text entered in `NutritionMaterialModal` with no validation. Yields stored XSS via `javascript:` URI on click.

**Fix:** Same scheme allow-list as CR-01. Validate inside `NutritionMaterialModal` on save (trim + reject non-http(s)) AND defensively at render time.

### CR-03: `editTarget` leaks across chats — wrong message edited (BLOCKER)

**File:** `src/mobile/MobileChatThread.jsx:65, 211-219`
**Issue:** `editTarget` is local state on the (long-lived) thread component, but `activeChatId` can change without unmounting the component. Flow:
1. User opens chat A, taps "Edit" on message → `setEditTarget(msgA)`.
2. User backs out (does NOT submit), opens chat B.
3. `editTarget?.id` is still `msgA.id`. On send, `editMsg(activeChat.id /* chat B */, editTarget.id /* A's msg id */, trimmed)` is called.

Either the call rewrites a message in chat B that happens to share the id (very likely with integer ids), or server-side check rejects — but client-side there is no chat-id guard.

**Fix:** Reset `editTarget`, `replyTarget`, `mentionQuery`, `showEmoji`, `text` (and the swipe state) in a `useEffect([activeChatId])`. Or store editTarget as `{ chatId, id }` and verify chatId at send time.

### CR-04: `messageRefs` collision for pending messages (BLOCKER for jump-to-message)

**File:** `src/mobile/MobileChatThread.jsx:474, 471`
**Issue:**
```jsx
ref={(el) => { if (el) messageRefs.current.set(item.msg.id, el); else messageRefs.current.delete(item.msg.id); }}
```
Pending messages have `id === undefined` (the key on line 471 falls back to `client_message_id`). All pending messages overwrite the same `messageRefs.current.set(undefined, el)` slot, so jump-to-message, search-result navigation, reply-jump and pin-bar scroll silently fail (or jump to wrong element) whenever any unconfirmed message exists.

**Fix:** Skip ref registration when id is missing:
```jsx
ref={(el) => {
  if (item.msg.id == null) return;
  if (el) messageRefs.current.set(item.msg.id, el);
  else messageRefs.current.delete(item.msg.id);
}}
```

### CR-05: Nested-path saver writes to wrong object on undefined/null segment (BLOCKER)

**File:** `src/components/QNutritionCard.jsx:11-21`, `src/components/QStressCard.jsx:12-22`
**Issue:**
```js
const pts = path.split(".");
let o = s.questionnaire;
for (const p of pts) { if (o && o[p] !== undefined) o = o[p]; }
// then: o[key] = value
```
Two failure modes:
1. **Silent wrong write:** If any segment is missing (e.g., `s.questionnaire.normalized.nutrition` not yet present), traversal stops at the parent. The next `o[key] = value` writes the field onto the wrong object (e.g., onto `s.questionnaire.normalized` instead of `.nutrition`), corrupting the questionnaire shape.
2. **Crash:** If `o[p]` is explicitly `null`, the guard `o[p] !== undefined` is true (since `null !== undefined`), so `o = null`. Next iteration's `o && o[p]` is false (skip), then `o[key] = value` throws `TypeError: Cannot set property of null`.

The sibling cards (`QActivityCard`, `QAnamnesCard`, etc.) all use `makeFieldSaver` from `utils/questionnaireUtils.js` — these two cards diverged because they hand-roll percent-clamping logic.

**Fix:** Reuse `makeFieldSaver` (extend it with an optional value-transform) instead of duplicating traversal. The shared util presumably handles missing paths correctly. If kept inline, fail loudly when the path can't be resolved.

### CR-06: Unguarded `r.matches`/`r.groups` destructuring on failed search (BLOCKER)

**File:** `src/mobile/MobileChatSearchOverlay.jsx:16-18`, `src/mobile/MobileSearchScreen.jsx:17-21`
**Issue:**
```js
const r = await searchInChat(chatId, q.trim());
if (!cancelled) {
  setMatches(r.matches || []);   // throws if r is null/undefined
```
If `searchInChat`/`searchGlobal` rejects, the exception propagates as an unhandled promise rejection (async setTimeout handler). If it resolves to `null`/`undefined` (e.g., on transport error inside the context), `r.matches` throws. Either way the user sees a frozen overlay with no recovery, plus a console error.

**Fix:**
```js
try {
  const r = await searchInChat(chatId, q.trim());
  if (!cancelled) { setMatches(r?.matches || []); setIndex(0); }
} catch { if (!cancelled) setMatches([]); }
```
Same in `MobileSearchScreen`.

## Warnings

### WR-01: Long-press timer never cleared on unmount → `setState` on unmounted component

**File:** `src/mobile/MobileChatThread.jsx:189-203`, `src/mobile/MobileChatList.jsx:64-78`
**Issue:** Long-press handlers schedule `window.setTimeout(... setCtx/setChatAction ..., 400ms)` but the components never clear `lpTimer.current` on unmount. If a user starts a long-press and then navigates away (back gesture, route change) within 400 ms, the timer fires after unmount → React "state update on unmounted component" warning and may briefly resurrect the context menu via batched render.

**Fix:**
```js
useEffect(() => () => window.clearTimeout(lpTimer.current), []);
```

### WR-02: Single shared `lpTimer` ref clobbered across messages/chats

**File:** `src/mobile/MobileChatThread.jsx:73-75`, `src/mobile/MobileChatList.jsx:56-58`
**Issue:** One `lpTimer` ref is shared across every rendered message/chat row. Sequence: touch message A (timer A scheduled), within 400 ms briefly touch message B (pointerdown overwrites `lpTimer.current` with timer B, pointermove on B may move past tolerance and clear timer B). Now timer A is still pending but `lpTimer.current` points at the already-cleared B id — the next pointermove on any element cannot cancel A. Result: spurious context menu pops on message A after lifting from B.

**Fix:** Either (a) store the timer per element (in a Map keyed by msg id / chat id), or (b) clear the previous timer at the start of each `onPointerDown` before scheduling a new one.

### WR-03: Swipe-back unmount-safety race

**File:** `src/mobile/MobileChatThread.jsx:177-178`
**Issue:** After a successful swipe back: `setSwipeX(window.innerWidth || 800); setTimeout(() => { setSwipeX(0); onBack?.(); }, 180);`. `onBack` typically triggers parent navigation that unmounts this component before 180 ms elapses. The deferred `setSwipeX(0)` then fires on an unmounted tree. Also the 180 ms timer is not stored in a ref and not cleared on unmount.

**Fix:** Store timer in a ref, clear in cleanup; or call `onBack` first and skip the `setSwipeX(0)` reset entirely (the component is going away).

### WR-04: `pendingScrollId` race — scroll silently fails if target not yet rendered

**File:** `src/mobile/MobileChatThread.jsx:101-110`
**Issue:** Effect clears `pendingScrollId.current = null` synchronously, then waits 150 ms for the element. If `messages[activeChatId]` is still loading (network fetch from `loadMessages`) at the 150 ms mark, `messageRefs.current.get(id)` returns `undefined` and the scroll is silently dropped. The ref has been cleared, so no future re-render attempts the scroll. This breaks the "jump to message from global search" flow whenever the chat hasn't been opened before.

**Fix:** Retry on each `msgList` change while `pendingScrollId.current` is non-null, OR keep the id in state and clear only after a successful scroll.

### WR-05: Image popup workflow is broken in modern browsers

**File:** `src/mobile/MobileChatThread.jsx:269-294`
**Issue:** `window.open("", "_blank", "noopener,noreferrer")` followed by `await getFileUrl(...)` then `popup.location.href = url`.
- On most browsers the second feature `noopener` causes `window.open` to return `null` even when the popup is allowed → falls into the `<a download>` fallback.
- Even when popup is opened, after an `await` the browser no longer considers the navigation user-initiated, so iOS/Safari and many mobile browsers will block the navigation.
- `setTimeout(() => URL.revokeObjectURL(url), 15000)` revokes the blob URL after 15 s; if the user is still viewing a large image in the popup tab, it will go blank.

**Fix:** Either generate the blob URL synchronously via a cached file URL (decrypt first, then open in click handler), or use a lightbox component within the SPA instead of a popup tab.

### WR-06: `useEffect` deps include unstable context callbacks

**File:** `src/mobile/MobileChatThread.jsx:84-99`, `src/mobile/MobileBookmarksScreen.jsx:10`, `src/mobile/MobileChatSearchOverlay.jsx:23`, `src/mobile/MobileSearchScreen.jsx:24`, `src/mobile/MobileMessengerShell.jsx:19-21`
**Issue:** Multiple effects depend on context-supplied callbacks (`loadMessages`, `markRead`, `loadPinnedForMe`, `searchInChat`, `searchGlobal`, `loadChats`). If the `MessengerContext` provider does not memoize these (need to verify in MessengerContext.jsx — note the file is currently modified per `git status`), every context state change re-creates the callbacks → effects fire on every keystroke / WS event, retriggering network calls and debounced searches.

**Fix:** Verify all of these are wrapped in `useCallback` in the provider. If not, wrap. This is a deep cross-file contract: components here assume stable identity but don't enforce it.

### WR-07: `loadPinnedForMe(null)` when `chatId` not set

**File:** `src/mobile/MobileBookmarksScreen.jsx:5-10`, called from `MobileMessengerShell.jsx:50` (`bookmarksChatId ?? activeChatId` — both can be null)
**Issue:** Effect always calls `loadPinnedForMe(chatId)` even when `chatId` is null/undefined. Depending on context implementation this may issue an invalid network request or throw.

**Fix:** `useEffect(() => { if (chatId) loadPinnedForMe(chatId); }, [chatId, loadPinnedForMe]);`

### WR-08: Duplicate condition in `canEdit` calculation

**File:** `src/mobile/MobileChatThread.jsx:338`
**Issue:**
```js
canEdit={ctx.msg.sender_id === user?.id && !ctx.msg.deleted_for_all && ctx.msg.msg_type === "text" && !ctx.msg.deleted_for_all}
```
`!ctx.msg.deleted_for_all` is checked twice. Indicates the author intended a different second check (probably `!ctx.msg.deleted_for_me` or `!ctx.msg.edited` / `!isOlderThan...`).

**Fix:** Identify the intended second predicate. At minimum drop the duplicate to avoid masking the missing check.

### WR-09: `hasUnreadMention` recomputes `lastRead` inside `.some` and may false-positive on first load

**File:** `src/mobile/MobileChatList.jsx:149-152`
**Issue:**
```js
const hasUnreadMention = ((messages[chat.id] || [])).some((m) => {
  const lastRead = (chat.receipts || []).find(...)?.last_read_message_id || 0;
  ...
});
```
`lastRead || 0`: if the user has no receipt row yet (brand-new chat membership), every previous mention message is flagged as unread, lighting the `@` badge for chats the user can't actually receive notifications for. Also `lastRead` is recomputed for every message; hoist it out of the `.some` callback.

**Fix:** Treat missing receipt as "all read up to latest seen" (or skip the chat entirely); compute `lastRead` once before the loop.

### WR-10: `messages` is a useless dep in `filtered` memo

**File:** `src/mobile/MobileChatList.jsx:80-101`
**Issue:** `useMemo(..., [chats, messages, query])` lists `messages` but the body only reads `chat.last_message`, `chat._lastMsgAt`, `chat.created_at`, and `chat.participants`. Every new message in any chat reruns sort + filter across all chats unnecessarily. Not a correctness bug per se but causes re-renders that interfere with WR-09's recomputation.

**Fix:** Drop `messages` from dep array, or compute the activity timestamp from `messages[chat.id]` so the dep is justified.

### WR-11: Bottom-anchor menu may overflow viewport

**File:** `src/mobile/MobileChatList.jsx:205-214` (and `MessengerContextMenu` placement in thread)
**Issue:** Floating menu uses `top: chatAction.y, left: chatAction.x` with width 180 and no clamping. Long-press near the right/bottom edge pushes the menu off-screen on small devices.

**Fix:** Clamp position to `[8, viewport - menuSize - 8]` for both axes.

### WR-12: Mention parser allocates fresh `RegExp` per participant per send

**File:** `src/mobile/MobileChatThread.jsx:131-140`
**Issue:** Builds a new `RegExp` for every participant on every send. For a 30-person chat that's 30 regex compilations. Also the test is case-sensitive — `@Ivan` mentions Ivan but `@ivan` doesn't, which may surprise users.

**Fix:** Either lowercase both sides or use the `i` flag. Cache compiled regexes by chat id / participant signature.

### WR-13: `clipboard.writeText` promise unhandled

**File:** `src/mobile/MobileChatThread.jsx:350`
**Issue:** `navigator.clipboard?.writeText(...)` may reject (insecure context, permission denied). The returned promise is dropped → unhandled rejection in console.

**Fix:** `navigator.clipboard?.writeText(...).catch(() => {});` and consider showing the error banner.

### WR-14: `pinForMe`/`unpinForMe` error tuple shape relied on without contract

**File:** `src/mobile/MobileChatThread.jsx:353-364`
**Issue:** `const r = await pinForMe(...); if (r && r.ok === false) setError(r.error || ...)`. Other call sites (e.g., `sendMsg` at line 218) use a boolean return. The two return contracts coexist; nothing prevents `sendMsg` from accidentally returning `{ ok: false, error }` in the future and silently flipping behavior of the `if (ok)` check at line 220 (truthy object → success).

**Fix:** Unify return contract across MessengerContext (`{ ok, error }` everywhere) or document each function's return type and add a small wrapper.

## Info

### IN-01: Dead `_personal` flag added to read-only objects

**File:** `src/mobile/MobileChatThread.jsx:433-434`
**Issue:** `{ ...m, _personal: true }` spreads pinned-message objects to inject a UI flag. Harmless but couples pin-bar component to internal field; cleaner to pass `(item, isPersonal) => unpin(...)`.

### IN-02: `PercentBar` width when `value` invalid renders empty bar at color `txM`

**File:** `src/components/PercentBar.jsx:24`
**Issue:** When `pct == null`, the inner bar is rendered with `width: 0%` and `color: $.txM` — visually fine, but the inner div is still in the DOM. Minor; consider conditional render.

### IN-03: `parseStressPercents` accepts >100% and clamps silently

**File:** `src/components/StressScale.jsx:6-12`
**Issue:** `120%` from user text becomes `100%` with no indication that input was malformed. Acceptable for display, but worth flagging in tests.

### IN-04: `SexEd` swallows all errors during programmatic select-open

**File:** `src/components/SexEd.jsx:27-32`
**Issue:** Three `try { ... } catch (_) {}` blocks with no telemetry. If `showPicker` and synthetic mousedown both fail (e.g., browsers that block synthetic clicks on `<select>`), the user clicks the field and nothing happens with no diagnostic.

**Fix:** Log once via the project logger if all three open strategies fail.

### IN-05: `RevisionPills` uses array index as React key

**File:** `src/components/RevisionPills.jsx:30`
**Issue:** `revisions.map((r, ri) => <span key={ri}>...)`. When the parent deletes a middle revision, React reuses DOM nodes by index and may mis-associate state (e.g., focus, in-edit text in `Ed`) with the wrong revision.

**Fix:** Use `r.id` (or `r.label + r.date`) as key.

---

_Reviewed: 2026-05-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
