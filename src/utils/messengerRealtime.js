export function shouldSyncMessengerInSurface({ pathname = "/", activeSection = "" } = {}) {
  return (
    pathname.startsWith("/app/messenger") ||
    pathname === "/messenger" ||
    activeSection === "messenger"
  );
}

export function shouldSyncMessengerInCurrentView() {
  if (typeof window === "undefined") return false;
  let activeSection = "";
  try { activeSection = localStorage.getItem("dash_sec") || ""; }
  catch (_) {}
  return shouldSyncMessengerInSurface({
    pathname: window.location.pathname,
    activeSection,
  });
}
