---
phase: code-review-full/frontend-logic
reviewed: 2026-05-19T00:00:00Z
depth: deep
files_reviewed: 28
files_reviewed_list:
  - src/App.jsx
  - src/main.jsx
  - src/dashboard.jsx
  - src/context/AuthContext.jsx
  - src/context/DashboardContext.jsx
  - src/context/EditorContext.jsx
  - src/context/ThemeContext.jsx
  - src/pwa/registerServiceWorker.js
  - src/utils/analyticsUtils.js
  - src/utils/chatTimeFormat.js
  - src/utils/clientSort.js
  - src/utils/crypto.js
  - src/utils/cryptoSession.js
  - src/utils/device.js
  - src/utils/formatReadAt.js
  - src/utils/helpers.js
  - src/utils/labOrderUtils.js
  - src/utils/messengerApi.js
  - src/utils/messengerCache.js
  - src/utils/messengerFont.js
  - src/utils/messengerUiUtils.js
  - src/utils/messengerUnread.js
  - src/utils/pushSubscription.js
  - src/utils/questionnaireUtils.js
  - src/utils/voiceWaveform.js
  - src/utils/websocket.js
  - public/sw.js
findings:
  critical: 5
  warning: 14
  info: 6
  total: 25
status: issues_found
---

# Frontend Logic — Deep Code Review

**Reviewed:** 2026-05-19
**Depth:** deep
**Files Reviewed:** 28
**Status:** issues_found

## Summary

Deep review across frontend contexts, utilities, service worker and app entry. MessengerContext.jsx was excluded as requested. Several real defects surfaced:

- **HTML/XSS sinks**: `dashboard.jsx` builds a print document by concatenating raw `currentClient.name`, `currentStage.title/doctor`, `currentClient.dob` and "sanitized" inner HTML into a new window. The "sanitization" only rewrites colors — it never escapes HTML or strips script/event handlers. This is exploitable if any client/stage field contains an attacker-controlled string.
- **Crypto / unlock UX**: `cryptoSession` stores the user's password in a plain module-level variable to relay it from LoginScreen to MessengerContext. Any module that imports it (or a future XSS) can read the password. The login flow also calls `setPendingPassword(password)` regardless of whether crypto is actually needed.
- **WebSocket reconnect**: `MsgSocket.connect()` does not clear `_retryTimer` when it succeeds, and `_scheduleReconnect()` re-arms on every onclose without any cap on parallel timers if `connect()` is called externally. Backoff is reset on open but never reset on a successful ticket fetch failure path. Additionally `_stopped` is never reset on a fresh `connect()` call after `disconnect()`, so the instance is unusable after teardown without throwing — silent no-op.
- **Service worker**: `notificationclick` always opens a brand new window, never focuses the already-open client. `push` handler trusts the entire payload — no validation that fields are strings. `fetch` handler falls back to `/app/messenger` for any failed GET (including images and JS chunks), which can cause HTML to be served where JS/asset bytes were expected.
- **React hygiene**: Multiple contexts return non-memoized object/function values (EditorContext, ThemeContext), causing re-renders. AuthContext's `authFetch` is recreated whenever the token changes, which (via DashboardContext) triggers full client refetch loops. SSE subscription in DashboardContext re-establishes on every `authFetch` change.
- **DashboardContext** has data-loss risks: `enqueueClientSave` for the "new client" branch silently returns if `clientSnapshot` is falsy — the new client is then permanently removed from the dirty set and never saved. Patch ops on retry are re-queued in the wrong order (`ops.concat(existing)` overwrites the natural ordering).

## Critical Issues

### CR-01: XSS via unescaped client/stage data in print window

**File:** `src/dashboard.jsx:118-126`, `src/utils/helpers.js:9-56`
**Issue:** `printSectionToPdf` opens a new window and writes a full HTML document via `w.document.write(...)` that interpolates `currentClient.name`, `currentStage.id`, `currentStage.title`, `currentStage.doctor`, `currentClient.dob`, the section label and `printContent` directly with no HTML escaping. `sanitizePrintHtml` is **not** a sanitizer — it only `String.replace`'s color tokens. Inline `<script>`, `onerror=`, or `javascript:` URLs in any of those fields are executed in the print window (same-origin, with access to `opener.localStorage` including the bearer token). Stage title and doctor are user/admin-editable, so this is a practical privilege-escalation primitive (low-privileged editor injects, an admin prints, token exfiltrated).
**Fix:**
- Escape all dynamic strings with a real HTML escaper (`&`, `<`, `>`, `"`, `'`).
- Run `printContent` through DOMPurify (with a strict allow-list) before writing it.
- Open the print window with `rel=noopener` and `window.opener = null` (or use a sandboxed iframe).
- Consider building the document with `document.createElement` + `textContent` to avoid `document.write`.

```js
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]
));
// then `<title>${esc(currentClient.name)} — ${esc(sectionLabel)}</title>` etc.
// printContent: sanitize with DOMPurify, not regex
```

### CR-02: Plaintext password lives in a module-global

**File:** `src/utils/cryptoSession.js:7-16`
**Issue:** `_pendingPassword` is a plain module-scoped variable holding the user's login password (set by `LoginScreen` and read once by `MessengerContext`). Any code with access to the module bundle (transitive imports, dev tools eval, dependency XSS) can call `consumePendingPassword()` or read the closure indirectly. The lifetime is "until consumed" — but if the messenger mount is delayed (slow network on `/api/auth/me`), the password lingers in memory longer than necessary, and on any failure path it may never be consumed and thus never cleared until `clearPendingPassword()` runs on logout.
**Fix:**
- Pass the password through a one-shot React context that owns its own lifecycle, or use a `WeakRef`/`Closure` that is wiped immediately after first read regardless of consumer state.
- After `applySession`, call `clearPendingPassword()` on a short timer (e.g. 30s) so it cannot live indefinitely.
- Consider deriving the wrapping key in `LoginScreen` itself and passing the derived non-extractable `CryptoKey` instead of the password.

### CR-03: Service worker `fetch` returns HTML shell for failed non-navigation GETs

**File:** `public/sw.js:20-31`
**Issue:** When network `fetch` rejects, the SW serves `caches.match(request)` falling back to `caches.match("/app/messenger")` for **any** GET to same-origin (images, CSS, JS chunks, fonts, blob URLs, JSON exports). Returning the HTML shell as the response body for, e.g., a hashed JS chunk request will cause browsers to fail script execution with cryptic MIME errors, and worse — code that fetches JSON via `fetch()` (not under `/api/`) will receive HTML and `.json()` will throw, breaking offline behaviour rather than improving it.
**Fix:** Only serve the shell fallback for navigation requests:

```js
event.respondWith(
  fetch(request).catch(() => caches.match(request).then((cached) => {
    if (cached) return cached;
    if (request.mode === "navigate") return caches.match("/app/messenger");
    return Response.error();
  }))
);
```

### CR-04: New-client save can be silently dropped

**File:** `src/context/DashboardContext.jsx:351-372, 423-439`
**Issue:** In `enqueueClientSave`, the `isNewClient` branch starts with `if (!clientSnapshot) return;` and the autosave effect (line 433) only calls `enqueueClientSave(id, client)` when `clsMap.get(id)` returns a client. If the autosave effect fires while React state has been re-derived such that the client is briefly absent (e.g. setCls called twice in the same tick with `prev.filter(...)`-like updates), the new client id remains in `newClientIdsRef` but its dirty flag has been cleared at the top of the effect (`dirtyClientsRef.current.clear()`). The chain then never enqueues a PUT for that id again — the new client is lost on the next refresh.
Additionally, when `clientSnapshot` is truthy but PUT fails, the code adds the id back to `dirtyClientsRef` but does **not** re-enqueue ops for it — the next autosave tick will try `enqueueClientSave` with a fresh snapshot, which is fine, but only if `dirty` is non-empty on the next tick (which depends on a subsequent state change). If no further edits happen, the user sees "created" but the record is never persisted.
**Fix:**
- Never clear `dirtyClientsRef` until a save successfully completes. Use a "claimed" set during the in-flight save and merge back on failure.
- If `clientSnapshot` is falsy for a new client, re-add to dirty set instead of silently returning.

### CR-05: Retry path reverses op ordering and risks duplicating analytics writes

**File:** `src/context/DashboardContext.jsx:413-418`
**Issue:** On PATCH failure, the code does `pendingClientOpsRef.current.set(clientId, ops.concat(existing))`. `ops` is the collapsed batch we just tried, and `existing` is whatever was queued while the request was in flight. Concatenating them in this order replays older operations *after* newer ones, which can resurrect deleted fields or revert later edits. Also, analytics ops were stripped before the PATCH and sent via `saveAnalytics`, but on failure they are not re-queued separately — the next collapse may keep analytics ops in the regular bucket and they will be sent twice (once via PATCH path that ignores them, once via the separate analytics PUT on the next round).
**Fix:** Re-queue with correct chronology: `existing.concat(ops)` (older first, since `existing` arrived after the in-flight ops were captured — actually invert: store an `inFlightOps` separate from `pendingOps` and on failure prepend the in-flight set). Track analytics ops separately end-to-end.

## Warnings

### WR-01: AuthContext value object recreated on every render

**File:** `src/context/AuthContext.jsx:140-144`
**Issue:** The `value={{...}}` is a new object every render of `AuthProvider`, forcing every consumer of `useAuth()` to re-render whenever any state in the provider changes — even consumers that only use, e.g., `user`. Combined with DashboardContext consuming `authFetch` and using it as an effect dep, this triggers cascading refetches.
**Fix:** Wrap with `useMemo([token, user, permissions, checking, login, logout, authFetch, applySession, updateUser])`.

### WR-02: `authFetch` identity changes whenever `token` changes, retriggering effects

**File:** `src/context/AuthContext.jsx:118-138`; `src/context/DashboardContext.jsx:241-274, 444-485`
**Issue:** `authFetch` is `useCallback([token, clearSessionCache])`. Every successful login changes token → new `authFetch` identity → every effect that lists `authFetch` (initial data load, SSE connect) tears down and re-runs. SSE reconnects on every token rotation and on every token-not-yet-set → set transition.
**Fix:** Stash the latest token in a `useRef` and make `authFetch` stable (`useCallback([], () => tokenRef.current ...)`).

### WR-03: ThemeContext / EditorContext value not memoized

**File:** `src/context/ThemeContext.jsx:19-23`; `src/context/EditorContext.jsx:9-13`
**Issue:** Same shape problem as WR-01 — new object every render, no `useMemo`.
**Fix:** Wrap value in `useMemo`.

### WR-04: MsgSocket cannot be reused after disconnect; reconnect races

**File:** `src/utils/websocket.js:31-70, 100-106`
**Issue:**
1. `disconnect()` sets `_stopped = true` but never resets it. Calling `connect()` again is a silent no-op.
2. `connect()` checks `readyState` but does not clear an outstanding `_retryTimer`. If a caller invokes `connect()` while a reconnect is pending, two concurrent `connect()` calls can race and create two sockets.
3. `_scheduleReconnect()` is called from both `onclose` and the catch block — if a ticket fetch fails fast and `onclose` also fires (because the WebSocket was never created), the backoff doubles twice for one failed attempt.
4. `ws.onerror` calls `ws.close()`, which will trigger `onclose` and schedule a reconnect — but `_scheduleReconnect` is not idempotent (it overwrites the timer, OK) yet the backoff increases on every onerror+onclose pair, doubling unnecessarily.
**Fix:** Reset `_stopped = false` at top of `connect()`, clear `_retryTimer` at top of `connect()`, guard against concurrent calls with a `_connecting` flag, and only schedule reconnect from one place.

### WR-05: WS heartbeat timer leaks if `connect` errors after open

**File:** `src/utils/websocket.js:80-90`
**Issue:** `_startHeartbeat()` is called from `onopen`, `_stopHeartbeat()` from `onclose` and `onerror`. If the WebSocket is GC'd without firing `onclose` (rare but possible in some browsers when the tab is throttled), the interval continues calling `this.send(...)` on a dead socket — harmless but wasteful.
**Fix:** Also `_stopHeartbeat()` at the top of `connect()` and `disconnect()`.

### WR-06: `MessengerApi.deleteMessage` sends body on DELETE

**File:** `src/utils/messengerApi.js:42-46`
**Issue:** The DELETE request has both `?scope=...` in the URL and a JSON `body: JSON.stringify({ scope })`. DELETE with body is allowed but some proxies/CDNs strip it; `apiJson` will also set `Content-Type: application/json` on it, doubling the source of truth. If client and server disagree about which scope to honour, you can delete-for-all when the user asked delete-for-me.
**Fix:** Pick one. Query param is the safer choice; drop the body.

### WR-07: `setupIdentityKeys` returns `privateKeyJwk` string unnecessarily

**File:** `src/utils/crypto.js:161-177`
**Issue:** Returning the unwrapped private key as JWK alongside `encryptedPrivateKeyJwk` defeats half the purpose of the password-wrapping. If a caller logs or persists the result naively (e.g. for "diagnostics"), the raw private key lands wherever the wrapped bundle goes.
**Fix:** Remove `privateKeyJwk` from the return value; the in-memory `keyPair` is sufficient.

### WR-08: PBKDF2 600k iterations + extractable identity key

**File:** `src/utils/crypto.js:38, 70`
**Issue:** `generateIdentityKeyPair` and `unwrapPrivateKey` create the private key with `extractable=true`. Once unwrapped, anything that grabs the key handle can re-export and exfiltrate it. Identity keys should be non-extractable wherever feasible (you only need extractability for the initial wrap).
**Fix:** Generate with `extractable=true` only for the initial wrap step; re-import as non-extractable for runtime use.

### WR-09: `clearSessionCache` wipes any `dash_`-prefixed key including unrelated apps' data

**File:** `src/context/AuthContext.jsx:27-39`
**Issue:** Iterating localStorage and removing every `dash_*` key works in the current app, but with no allow-list this silently nukes any future per-feature settings (e.g. a user's saved filter state for analytics). Combined with the `dash_theme` exception being the only carve-out, this is fragile.
**Fix:** Use an explicit deny-list of session-related prefixes (`dash_token`, `dash_user`, `dash_messenger_*`, `dash_analytics_scroll_y`, …), or store session-only keys under a separate `sess_` prefix.

### WR-10: `setupIdentityKeys` salt is 16 bytes but `key_derivation_salt`/`iv` returned base64 of distinct random buffers — keyDerivationIv is the wrap IV, not a KDF IV

**File:** `src/utils/crypto.js:161-176`
**Issue:** The field is misnamed (`keyDerivationIv`) but actually returns the AES-GCM IV from `wrapPrivateKey`. PBKDF2 has no IV. The naming is misleading and the bundle on the server very likely stores it as `key_derivation_iv` which it isn't. Not a functional bug — but it is a footgun the next maintainer will trip on.
**Fix:** Rename to `wrapIv` / `key_wrap_iv`.

### WR-11: `apiJson` swallows server error bodies that are not JSON

**File:** `src/utils/messengerApi.js:1-12`
**Issue:** `await res.json().catch(() => null)` returns `null` for HTML/text 5xx pages. The thrown error then says "Ошибка сервера" with no status. Debugging 502/504 from a CDN becomes blind.
**Fix:** On non-OK, fall back to `res.text()` (truncated) and include `res.status` in the error.

### WR-12: `getAutoDeficitsFromAnalytics` constructs `RegExp` from server-supplied source

**File:** `src/utils/analyticsUtils.js:218-224`
**Issue:** `rule.markerRegex` comes from `parseDeficitPresetPayload(rawValue)` which trusts whatever the references endpoint returns. A pathological pattern (catastrophic backtracking) will hang the main thread when scanning markers. Sample: `(a+)+$` matched against a long marker name.
**Fix:** Either restrict the regex source (length + character whitelist), wrap in `try { withTimeoutAbort }` (not possible in JS without a worker), or move regex matching into a Web Worker. At minimum, reject regexes whose `source.length > 200`.

### WR-13: `formatChatListTime` mis-handles week boundary across DST

**File:** `src/utils/chatTimeFormat.js:11-23`
**Issue:** `dayIndex` uses `getTime()/86400000`. Across DST transitions, the local midnight timestamp is not aligned to a 24h grid in UTC, so `Math.floor(t/86400000)` can disagree by ±1 day at the boundary. Result: a message sent yesterday displays today's hh:mm right after spring-forward, or vice versa.
**Fix:** Compute the difference using `Math.round((midnight(now) - midnight(d)) / 86_400_000)` after subtracting timezone offsets, or use `differenceInCalendarDays` from `date-fns`.

### WR-14: `DashboardContext` SSE effect reads token from localStorage instead of state

**File:** `src/context/DashboardContext.jsx:444-485`
**Issue:** `const token = localStorage.getItem("dash_token")` inside an effect that depends on `loaded` and `authFetch`. If the user logs out, the auth state clears immediately but the SSE EventSource lives until the effect's cleanup fires (next dep change). Worse: on the *next* mount the localStorage read could pick up a stale token if logout was racy. Use the token from `useAuth()`.
**Fix:** Pull `token` from context; include it in dep array.

## Info

### IN-01: ErrorBoundary "reset" wipes all localStorage including theme

**File:** `src/App.jsx:24`
**Issue:** Calls `localStorage.clear()`, which is heavier than needed and contradicts the theme-preservation logic in `clearSessionCache`.
**Fix:** Reuse `clearSessionCache` semantics or only remove app-prefixed keys.

### IN-02: `usePathname` does not react to `pushState`/`replaceState`

**File:** `src/App.jsx:35-43`
**Issue:** Listens only for `popstate`. Any client-side navigation that uses `history.pushState` (e.g. from imperative code) will not trigger a re-render.
**Fix:** Monkey-patch pushState/replaceState to fire a custom event, or use a router.

### IN-03: `voiceWaveform.packWaveform` falls back to Node `Buffer` that doesn't exist in browser

**File:** `src/utils/voiceWaveform.js:39-50`
**Issue:** `Buffer.from(...)` will throw ReferenceError in the browser if `btoa`/`atob` are unavailable, which they never are in modern browsers but the fallback is dead code that will crash in tests run without a Node polyfill.
**Fix:** Remove the dead Buffer fallback, or feature-detect `typeof Buffer !== "undefined"`.

### IN-04: SW `notificationclick` always opens a new window

**File:** `public/sw.js:46-50`
**Issue:** Standard pattern is to enumerate `self.clients.matchAll({ type:"window" })` and `focus()` an existing tab if one matches.
**Fix:** Iterate clients first; only `openWindow` when none match.

### IN-05: `messengerCache.openDb` closes the DB after every transaction

**File:** `src/utils/messengerCache.js:27-80`
**Issue:** Opening and closing the IndexedDB connection per transaction is wasteful and causes "blocked" upgrades if multiple tabs run at once. Not a bug, but the chained-write pattern combined with per-op `openDb` will serialize unnecessarily.
**Fix:** Keep a singleton `dbPromise`.

### IN-06: `dashboard.jsx` writes `dash_sec=messenger` as a side effect during render

**File:** `src/App.jsx:54`
**Issue:** `if (wantsDesktopMessenger) localStorage.setItem('dash_sec', 'messenger');` runs inside render — side effect during render is a React anti-pattern (will run during concurrent renders that may be discarded, repeatedly writing the same value, and on SSR will throw).
**Fix:** Move to `useEffect`.

---

_Reviewed: 2026-05-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
