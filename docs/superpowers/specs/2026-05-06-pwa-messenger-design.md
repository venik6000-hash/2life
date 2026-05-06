# PWA Messenger Design

Date: 2026-05-06

## Goal

Build a web messenger that works like an installable mobile app on iPhone and Android without publishing to App Store or Google Play.

The first release is only the messenger. The future mobile app area may later include protocols, analytics, dashboard, and questionnaires, but those areas are out of scope for this spec.

## Accepted Product Shape

- Desktop employees keep the current flow: open the main site, log in, see the dashboard with all sections, and use the Messenger section from the existing section list.
- Mobile users open the site, log in with a mobile-first login screen, and land in `/app/messenger`.
- The installable PWA starts at `/app/messenger`.
- `/messenger` is the desktop messenger surface.
- `/app/messenger` is the mobile PWA messenger surface.
- Both surfaces use the same server, accounts, permissions, chats, messages, files, read receipts, and push subscriptions.

## Non-Goals

- Do not adapt the whole dashboard to mobile in this release.
- Do not publish native iOS or Android apps.
- Do not migrate old E2E messenger history.
- Do not preserve old chats, old messages, old messenger files, or old messenger key bundles.
- Do not change non-messenger product flows.

## Data Safety Boundary

Existing non-messenger production data must not be damaged.

Protected data includes:

- users and passwords;
- roles and permissions;
- clients, stages, assignments, doctors;
- questionnaires, protocols, analytics, menus, journal, lab orders;
- analytics files and other non-chat uploads.

Messenger data may be deleted, reset, or recreated:

- chats;
- chat participants;
- messages;
- message hidden/read state;
- chat files;
- old E2E public/private key bundles;
- new messenger push/device/sync tables.

Any destructive reset must be guarded by an explicit allowlist of messenger tables and messenger upload directories. It must not run broad database cleanup. Old files under `server/uploads/chat` may be removed; other upload directories must not be touched.

## Architecture

The project remains one web platform with one backend and one database.

Frontend surfaces:

- `/` keeps the current desktop dashboard.
- `/messenger` provides the desktop messenger experience for employees.
- `/app/messenger` provides the mobile PWA messenger experience for clients and employees.

The mobile app zone `/app/*` is reserved for future mobile product areas. In this release it contains only the messenger.

The messenger backend becomes the single source of truth for both desktop and mobile. It owns:

- server-encrypted message storage;
- file storage and metadata;
- chat participants and role checks;
- WebSocket realtime events;
- REST history and sync APIs;
- push subscriptions;
- offline/reconnect sync state.

The current E2E messenger path is replaced. New messages use server-side encryption instead of client-side E2E keys. This removes the separate messenger unlock step on mobile and supports normal multi-device use, push, recovery, and offline queues.

## Authentication And Routing

Desktop flow:

1. Employee opens the main site.
2. Employee logs in.
3. App opens the normal dashboard.
4. Messenger is available as a dashboard section as it is today.

Mobile flow:

1. Client or employee opens the site on a phone, or launches the installed PWA.
2. User sees a dedicated mobile login screen.
3. Login screen has clear mobile-sized fields for login and password, large tap targets, password visibility toggle, useful loading/error states, and no desktop dashboard chrome.
4. After login, the user lands directly in `/app/messenger`.

The mobile login must feel designed for a phone, not like a compressed desktop form.

The backend still validates every request with the existing auth and permission model. Mobile routing must not grant any permission unavailable to the same account on desktop.

## Permissions

Messenger access follows the existing account and role model.

Clients:

- see only chats available to their account;
- read and send messages;
- send and open files;
- receive private push notifications;
- use offline cache and queued sending.

Employees:

- see client chats according to client access and assignments;
- see internal chats where they are participants;
- create internal chats when their role allows it;
- add or remove participants when their role and chat role allow it;
- pin, rename, and manage chats where allowed.

Permission checks must exist in the backend, not only in UI visibility.

## Messages And Sync

Online delivery uses WebSocket. REST APIs support:

- initial chat list loading;
- paginated history;
- fallback sending;
- reconnect sync from a cursor;
- read receipt updates;
- chat and participant management.

Realtime events include:

- new message;
- edited message;
- deleted message;
- read receipts;
- participant added or removed;
- chat created or updated;
- typing state;
- sync-needed or reconnect state where useful.

After reconnect, clients request missed changes from the last sync cursor. The goal is that desktop and mobile converge to the same server state even after sleep, offline mode, or app restarts.

## Files

Files are stored on the server and attached to messages.

Required behavior:

- package/batch file upload;
- images and ordinary files;
- previews and metadata in chat;
- server-side storage remains source of truth;
- offline file access only for files already opened or downloaded on that device;
- clear UI state when a file needs network access;
- settings action to clear local file cache.

This should behave similarly to Telegram: known files open from local cache when available; otherwise they are fetched from the server.

## Offline

The mobile PWA keeps a local cache for the last 30 days of messages in accessible/opened chats.

Offline behavior:

- previously cached messages remain readable;
- opened/downloaded files remain available from local cache;
- messages written offline appear in the chat as pending;
- files selected offline are queued locally when browser storage allows it;
- queued items send in original order after reconnect;
- failures remain visible with retry actions;
- the user can clear local cache from settings.

The server remains authoritative. Local data is a cache plus pending queue, not a second source of truth.

## PWA

`/app/messenger` must be installable as a PWA.

Required PWA pieces:

- web app manifest with `start_url: /app/messenger`;
- `display: standalone`;
- iOS and Android icons;
- theme and background colors;
- mobile-safe viewport and safe-area handling;
- service worker for app shell, push events, cache management, and offline support where the browser permits it;
- clear install and permission states in the mobile UI.

The PWA should open directly into the messenger after authentication.

## Push Notifications

Push notifications are required in the first release.

Notification rules:

- push works for installed PWA where the platform supports it;
- server stores push subscriptions per user and device/browser;
- new messages trigger push to relevant participants;
- sender's current active device should not receive redundant push when reliably detectable;
- push content is private: no message text and no file content;
- notification text may include a generic title and chat name, such as "New message" and the chat title;
- if permission is denied or unsupported, the UI shows that notifications are unavailable.

Development and staging:

- VAPID keys are configured through environment variables;
- Chrome/Android can be tested locally or through HTTPS tunneling/staging;
- iOS Web Push must be validated with an installed PWA on an HTTPS domain.

## Mobile UX

Mobile messenger screens:

- mobile login;
- chat list with unread counts, pinned chats, search, and network/sync status;
- chat thread with messages, files, emojis, image/file viewing, pending states, and retry states;
- chat settings;
- notification and cache settings;
- participant management for employees with permission;
- create internal chat for employees with permission.

The mobile UI should not display the desktop dashboard sidebar or desktop section shell. It should feel like a focused messenger app.

Error states must be explicit:

- no network;
- session expired;
- push denied;
- push unsupported;
- file not cached;
- send failed;
- insufficient permissions;
- sync conflict or stale state.

## Migration Plan

Old messenger history and old E2E data can be discarded.

Migration requirements:

- reset only messenger tables and messenger upload files;
- keep all non-messenger tables and uploads intact;
- rebuild client chat availability from current users, roles, assignments, and client access;
- create new messenger schema using the repository's existing database initialization workflow;
- avoid Prisma-specific migration assumptions because this repository currently manages schema in `server/services/db.js`;
- document the reset command or startup behavior before implementation.

## Acceptance Criteria

Primary user-visible criteria:

- Desktop employee login still opens the existing dashboard with the Messenger section available.
- Mobile client or employee login opens `/app/messenger` with a mobile-first login and messenger UI.
- Desktop and mobile users see the same chats and synchronized messages through one server.
- Installed PWA receives private push notifications for new messages without exposing message text.
- Offline mobile users can read cached messages from the last 30 days and send queued messages after reconnect.
- Non-messenger data remains unchanged after messenger reset/migration.

Secondary technical criteria:

- Backend permission checks prevent mobile-only privilege escalation.
- Push subscription create/delete/send paths work in dev/staging.
- WebSocket and REST reconnect sync converge after offline/sleep.
- Local cache cleanup removes mobile cached messages/files without deleting server data.
- Reset/migration code is allowlisted to messenger tables and chat upload files only.

## Validation Strategy

Run targeted validation instead of relying only on broad build success.

Backend:

- permissions checks for client, employee, admin, and participant roles;
- messenger reset guard;
- message send/read/edit/delete flows;
- push subscription and notification dispatch;
- sync cursor after reconnect.

Frontend:

- desktop dashboard routing smoke test;
- mobile login routing to `/app/messenger`;
- mobile chat list and thread behavior;
- offline queue states;
- cache clearing;
- notification permission states.

Device/browser:

- desktop browser for employee dashboard and `/messenger`;
- Android Chrome installed PWA;
- iPhone installed PWA on HTTPS staging/dev domain;
- offline/reconnect behavior on at least one mobile device.

## Implementation Decisions

- Server encryption uses AES-256-GCM with a deployment secret from environment configuration. Messages and file blobs are encrypted before durable storage and decrypted only inside the authenticated server request/dispatch path.
- Messenger schema should reuse existing messenger table names where practical and add new messenger-scoped tables for devices, push subscriptions, sync cursors, and queued/delivery state.
- The reset script or endpoint must use a hardcoded messenger allowlist and must refuse to run if the target list contains non-messenger tables or non-chat upload paths.
- Implementation should be staged so routing/PWA, data reset, server encryption, push, and offline queue can be validated independently.
- If implementation needs a new production dependency for Web Push, that dependency requires explicit approval before it is added.
