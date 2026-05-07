export function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
}

export function isMobileAppPath(pathname = window.location.pathname) {
  return pathname.startsWith("/app/");
}

export function isDesktopMessengerPath(pathname = window.location.pathname) {
  return pathname === "/messenger";
}
