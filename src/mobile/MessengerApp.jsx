import { MessengerProvider } from "../context/MessengerContext";
import MobileMessengerShell from "./MobileMessengerShell";

export default function MessengerApp() {
  return (
    <MessengerProvider>
      <MobileMessengerShell />
    </MessengerProvider>
  );
}
