import { useTheme } from "../context/ThemeContext";

export default function SidebarShell({
  expanded,
  header,
  clientPicker,
  stages,
  navigation,
  footer,
}) {
  const { $ } = useTheme();
  const width = expanded ? 232 : 54;

  return (
    <div
      style={{
        width,
        minWidth: width,
        background: $.bgC,
        borderRight: `1px solid ${$.brd}`,
        display: "flex",
        flexDirection: "column",
        transition: "all .25s",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {header}
      {clientPicker}
      {stages}
      {navigation}
      {footer}
    </div>
  );
}
