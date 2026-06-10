import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { useDashboard } from "../context/DashboardContext";
import ConnectionBanner from "../components/ConnectionBanner";
import MessengerChatList from "../components/MessengerChatList";
import MessengerChatWindow from "../components/MessengerChatWindow";
import MessengerParticipantsPanel from "../components/MessengerParticipantsPanel";
import MessengerShell, { MessengerEmptyState } from "../components/MessengerShell";
import Wrapper from "../components/Wrapper";
import { isClientRole } from "../utils/messengerUiUtils";

export default function MessengerSection() {
  const { user } = useAuth();
  const { cid, cls, isAdmin, canWriteSection } = useDashboard();
  const {
    ready, wsConnected,
    chats, chatsLoaded, activeChatId, setActiveChatId, messages,
    loadChats, loadMessages, sendMsg, sendFiles, forwardMsg, editMsg, deleteMsg,
    downloadFile, downloadFiles, getFileUrl, markRead,
    createNewChat, updateChatSettings, addParticipant, removeParticipant,
  } = useMessenger();

  const [showParticipants, setShowParticipants] = useState(false);
  const autoCreateRef = useRef(false);
  const pendingJumpRef = useRef(null);
  const [jumpToMessageId, setJumpToMessageId] = useState(null);
  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const canWriteMessenger = canWriteSection("messenger");
  const canCreateChat = !isClientRole(user) && canWriteMessenger;
  const hasGlobalClientAccess = isAdmin || !!user?.all_clients_access;

  useEffect(() => {
    if (!ready) return;
    if (hasGlobalClientAccess) { loadChats(); return; }
    loadChats(cid || undefined);
  }, [ready, hasGlobalClientAccess, cid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || !isAdmin || !chatsLoaded || !Array.isArray(cls) || cls.length === 0) return;
    if (autoCreateRef.current) return;
    const existingByClient = new Set(chats.map((c) => c.client_id));
    const missingClients = cls.filter((client) => !existingByClient.has(client.id));
    if (missingClients.length === 0) return;
    autoCreateRef.current = true;
    (async () => {
      for (const client of missingClients) {
        const title = client.shortName || client.name || "Чат";
        await createNewChat({ clientId: client.id, title, participantUserIds: [] });
      }
      await loadChats();
    })().finally(() => { autoCreateRef.current = false; });
  }, [ready, isAdmin, chatsLoaded, cls, chats, createNewChat, loadChats]);

  useEffect(() => {
    if (!activeChatId || !ready) return;
    if (!messages[activeChatId]) loadMessages(activeChatId);
  }, [activeChatId, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeChatId || pendingJumpRef.current?.chatId !== activeChatId) return;
    setJumpToMessageId(pendingJumpRef.current.messageId);
    pendingJumpRef.current = null;
  }, [activeChatId]);

  return (
    <MessengerShell
      chatList={(
        <MessengerChatList
          chats={chats}
          activeChatId={activeChatId}
          setActiveChatId={setActiveChatId}
          user={user}
          createNewChat={createNewChat}
          messages={messages}
          canCreateChat={canCreateChat}
          onSearchJump={(chatId, messageId) => {
            pendingJumpRef.current = { chatId, messageId };
            setActiveChatId(chatId);
            if (chatId === activeChatId) {
              setJumpToMessageId(messageId);
              pendingJumpRef.current = null;
            }
          }}
        />
      )}
      banner={!wsConnected ? <ConnectionBanner /> : null}
    >
      {activeChat ? (
        <Wrapper dir="row" flex={1} minHeight={0}>
          <Wrapper flex={1} dir="column" minWidth={0}>
            <MessengerChatWindow
              chat={activeChat}
              chats={chats}
              user={user}
              readOnly={!canWriteMessenger}
              messages={messages}
              sendMsg={sendMsg}
              sendFiles={sendFiles}
              forwardMsg={forwardMsg}
              editMsg={editMsg}
              deleteMsg={deleteMsg}
              markRead={markRead}
              downloadFile={downloadFile}
              downloadFiles={downloadFiles}
              getFileUrl={getFileUrl}
              showParticipants={showParticipants}
              setShowParticipants={setShowParticipants}
              updateChatSettings={updateChatSettings}
              jumpToMessageId={jumpToMessageId}
              onJumpHandled={() => setJumpToMessageId(null)}
            />
          </Wrapper>
          {showParticipants && (
            <MessengerParticipantsPanel
              chat={activeChat}
              user={user}
              readOnly={!canWriteMessenger}
              addParticipant={addParticipant}
              removeParticipant={removeParticipant}
              onClose={() => setShowParticipants(false)}
            />
          )}
        </Wrapper>
      ) : (
        <MessengerEmptyState />
      )}
    </MessengerShell>
  );
}
