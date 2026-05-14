import { useEffect, useState } from "react";
import { useMessenger } from "../context/MessengerContext";
import MobileChatList from "./MobileChatList";
import MobileChatThread from "./MobileChatThread";
import MobileMessengerSettings from "./MobileMessengerSettings";
import MobileSearchScreen from "./MobileSearchScreen";
import MobileBookmarksScreen from "./MobileBookmarksScreen";
import MessengerPushPrompt, { shouldShowPushPrompt } from "../components/MessengerPushPrompt";
import MessengerIosInstallBanner, { shouldShowIosInstallBanner } from "../components/MessengerIosInstallBanner";

export default function MobileMessengerShell() {
  const { activeChatId, setActiveChatId, loadChats, ready } = useMessenger();
  const [view, setView] = useState("chats");
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [showIosBanner, setShowIosBanner] = useState(false);

  useEffect(() => {
    if (ready) loadChats();
  }, [loadChats, ready]);

  useEffect(() => {
    if (!activeChatId && view === "thread") setView("chats");
  }, [activeChatId, view]);

  useEffect(() => {
    setShowPushPrompt(shouldShowPushPrompt());
    setShowIosBanner(shouldShowIosInstallBanner());
  }, []);

  return (
    <>
      {showPushPrompt && <MessengerPushPrompt onClose={() => setShowPushPrompt(false)} />}
      {showIosBanner && <MessengerIosInstallBanner onClose={() => setShowIosBanner(false)} />}

      {view === "settings" && <MobileMessengerSettings onBack={() => setView("chats")} />}
      {view === "search" && (
        <MobileSearchScreen
          onBack={() => setView("chats")}
          onSelectChat={(chatId) => {
            setActiveChatId(chatId);
            setView("thread");
          }}
        />
      )}
      {view === "bookmarks" && (
        <MobileBookmarksScreen
          chatId={activeChatId}
          onBack={() => setView("thread")}
          onJumpToMessage={() => { setView("thread"); }}
        />
      )}
      {view === "thread" && activeChatId && (
        <MobileChatThread onBack={() => setView("chats")} />
      )}
      {(view === "chats" || (view === "thread" && !activeChatId)) && (
        <MobileChatList
          onOpenChat={() => setView("thread")}
          onOpenSettings={() => setView("settings")}
          onOpenSearch={() => setView("search")}
        />
      )}
    </>
  );
}
