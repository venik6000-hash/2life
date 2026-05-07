import { useEffect, useState } from "react";
import { useMessenger } from "../context/MessengerContext";
import MobileChatList from "./MobileChatList";
import MobileChatThread from "./MobileChatThread";
import MobileMessengerSettings from "./MobileMessengerSettings";

export default function MobileMessengerShell() {
  const { activeChatId, loadChats, ready } = useMessenger();
  const [view, setView] = useState("chats");

  useEffect(() => {
    if (ready) loadChats();
  }, [loadChats, ready]);

  useEffect(() => {
    if (!activeChatId && view === "thread") setView("chats");
  }, [activeChatId, view]);

  if (view === "settings") return <MobileMessengerSettings onBack={() => setView("chats")} />;
  if (activeChatId && view === "thread") return <MobileChatThread onBack={() => setView("chats")} />;
  return <MobileChatList onOpenChat={() => setView("thread")} onOpenSettings={() => setView("settings")} />;
}
