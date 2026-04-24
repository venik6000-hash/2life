import { useTheme } from "../context/ThemeContext";
import ReadonlyBanner from "./ReadonlyBanner";

export default function DashboardShell({
  sidebar,
  header,
  modals,
  activeSectionId,
  readOnly,
  mainRef,
  printRef,
  onMainScroll,
  children,
}) {
  const { $ } = useTheme();
  const isFullHeightSection = activeSectionId === "admin" || activeSectionId === "messenger";
  const isMessenger = activeSectionId === "messenger";

  return (
    <div
      style={{
        background: $.bg,
        color: $.tx,
        height: "100vh",
        fontFamily: "'Segoe UI',-apple-system,sans-serif",
        fontSize: 13,
        lineHeight: 1.4,
        display: "flex",
        transition: "all .2s",
        overflow: "hidden",
      }}
    >
      {sidebar}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
        {header}
        <div
          ref={mainRef}
          onScroll={onMainScroll}
          style={{
            flex: 1,
            overflow: isMessenger ? "hidden" : "auto",
            padding: isFullHeightSection ? 0 : 20,
            minWidth: 0,
            display: isMessenger ? "flex" : "block",
            flexDirection: "column",
          }}
        >
          {readOnly && <ReadonlyBanner />}
          <div
            ref={printRef}
            style={isFullHeightSection ? {
              height: "100%",
              flex: 1,
              display: "flex",
              flexDirection: "column",
            } : undefined}
          >
            {children}
          </div>
        </div>
      </div>
      {modals}
    </div>
  );
}
