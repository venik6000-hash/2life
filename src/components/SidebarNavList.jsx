import SidebarNavItem from "./SidebarNavItem";

export default function SidebarNavList({ expanded, sections, activeSectionId, onSelectSection }) {
  return (
    <div
      style={{
        flex: 1,
        padding: expanded ? "10px 14px" : "10px 6px",
        overflow: "auto",
      }}
    >
      {sections.map((section) => (
        <SidebarNavItem
          key={section.id}
          icon={section.ic}
          label={section.lb}
          active={activeSectionId === section.id}
          onClick={() => onSelectSection(section.id)}
          collapsed={!expanded}
        />
      ))}
    </div>
  );
}
