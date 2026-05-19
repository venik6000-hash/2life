import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const mustContain = (source, needle, label) => {
  assert.ok(source.includes(needle), label);
};
const mustNotContain = (source, needle, label) => {
  assert.ok(!source.includes(needle), label);
};

const context = read("src/context/MessengerContext.jsx");
const ws = read("server/services/ws.js");
const routes = read("server/routes/messenger.js");
const db = read("server/services/db.js");
const mobileThread = read("src/mobile/MobileChatThread.jsx");
const voiceRecorder = read("src/components/MessengerVoiceRecorder.jsx");
const mobileSettings = read("src/mobile/MobileMessengerSettings.jsx");
const mobileShell = read("src/mobile/MobileMessengerShell.jsx");
const desktopList = read("src/components/MessengerChatList.jsx");
const shell = read("src/components/MessengerShell.jsx");
const bubble = read("src/components/MessageBubble.jsx");
const settings = read("src/components/MessengerSettingsPanel.jsx");
const envBackedVerifyScripts = [
  "scripts/verifyMessengerBulk.mjs",
  "scripts/verifyMessengerMention.mjs",
  "scripts/verifyMessengerPin.mjs",
  "scripts/verifyMessengerReply.mjs",
  "scripts/verifyMessengerSearch.mjs",
  "scripts/verifyMessengerSettings.mjs",
];

assert.ok(
  context.indexOf("const loadPinnedForAll") < context.indexOf("const handleWsEvent"),
  "loadPinnedForAll must be declared before handleWsEvent uses it",
);
mustContain(ws, "reply_to_message_id: row.reply_to_message_id || null", "WS new_message payload must include reply_to_message_id");
mustContain(ws, "pinned_at: row.pinned_at || null", "WS new_message payload must include pinned_at");
mustContain(context, "case \"messages_deleted_self_bulk\"", "bulk self-delete WS event must be handled by client");
mustContain(context, "case \"message_pinned\":", "pin sync events must be replayed explicitly");
mustContain(context, "loadPinnedForAll(chatId)", "pin replay must refresh pin bar");
mustContain(context, "reply_to_message_id: fullPayload.replyToMessageId || null", "optimistic replies must include reply_to_message_id");
mustContain(context, "meta: buildMessageMeta(fullPayload)", "optimistic/pending messages must include mention metadata");
mustContain(routes, "const rows = await getMessagesByIds(chatId, ids);", "bulk self-delete must validate ids against the current chat");
assert.match(db, /WHERE\s+m\.chat_id = \$1 AND m\.id = ANY\(\$3::int\[\]\)/, "bulk hide helper must be scoped to chat");
mustContain(routes, "unpinMessageForAll(chatId, messageId)", "unpin for all must stay scoped to chat");
mustContain(mobileThread, "onPick={(participant)", "mobile mention picker must pass the prop expected by MessengerMentionPicker");
mustNotContain(mobileThread, "onDeleteSelf={() => { setCtx(null); }}", "mobile delete self must not be a no-op");
mustNotContain(mobileThread, "onDeleteAll={() => { setCtx(null); }}", "mobile delete all must not be a no-op");
mustContain(mobileShell, "pendingScrollId.current = messageId", "mobile global search must preserve target message id");
mustContain(desktopList, "onSearchJump", "desktop global search must expose target message id to parent");
mustContain(desktopList, "width: 300", "desktop chat list must keep enough width for search and badges");
mustContain(desktopList, "height: \"100%\"", "desktop chat list must fill the shell instead of being clipped");
mustNotContain(db, "m.text", "messenger DB queries must not read legacy messages.text");
mustContain(db, "m.encrypted_text", "messenger DB queries must use encrypted_text for stored message content");
mustNotContain(routes, "getMessageById(messageId)", "readers endpoint must scope message lookup by chat id");
mustNotContain(db, "u.avatar_url", "readers query must not select a non-existent users.avatar_url column");
mustContain(shell, "cloneElement(chatList", "settings action must be injected into the chat-list header, not overlaying the list");
mustContain(shell, "width: \"min(380px, 100%)\"", "desktop settings drawer must fit narrow messenger containers");
mustContain(settings, "gridTemplateColumns: \"repeat(auto-fit, minmax(104px, 1fr))\"", "settings theme buttons must wrap on narrow screens");
mustContain(settings, "getMessengerFontConfig(fontSize)", "settings font selector must affect rendered control sizes");
mustContain(mobileSettings, "overflowX: \"hidden\"", "mobile settings screen must prevent horizontal overflow");
mustContain(bubble, "width: \"100%\"", "message bubble row must keep a full-width layout context");
mustContain(bubble, "overflowWrap: \"anywhere\"", "long message text must wrap inside the bubble");
mustContain(bubble, "fontSize: cfg.message", "message text must respect messenger font size setting");
mustContain(voiceRecorder, "WebkitUserSelect: \"none\"", "voice recorder active UI must disable iOS text selection");
mustContain(voiceRecorder, "WebkitTouchCallout: \"none\"", "voice recorder active UI must disable iOS callout/loupe");
mustContain(voiceRecorder, "touchAction: \"none\"", "voice recorder active UI must own touch gestures");
mustContain(voiceRecorder, "document.body.style.webkitUserSelect", "voice recorder must suppress body text selection while recording");
mustContain(voiceRecorder, "e.preventDefault?.();", "voice recorder drag move must prevent native selection/scroll handling");
for (const scriptPath of envBackedVerifyScripts) {
  mustNotContain(read(scriptPath), "process.exit(0)", `${scriptPath} must fail when required env is missing`);
}

console.log("messenger implementation static ok");
