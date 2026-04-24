import { useState } from "react";
import {
  buildLabOrderPrintDocument,
  getSelectedLabOrderItems,
  normalizeLabOrderTemplates,
} from "../utils/labOrderUtils";
import LabOrderGroupCard from "../components/LabOrderGroupCard";
import LabOrderHeaderCard from "../components/LabOrderHeaderCard";

export default function LabOrderSection({
  st,
  uS,
  cl,
  todayLabel,
  labOpenGroups,
  setLabOpenGroups,
  labOrderTemplates,
}) {
  const [dragLabIndex, setDragLabIndex] = useState(null);
  const [dragLabOver, setDragLabOver] = useState(null);
  const sel = st.labOrderSelected || {};
  const templateGroups = normalizeLabOrderTemplates(labOrderTemplates || []);
  const groupOrder = Array.isArray(st.labOrderGroupOrder) ? st.labOrderGroupOrder : [];
  const groupRank = new Map(groupOrder.map((name, idx) => [name, idx]));
  const groups = templateGroups
    .map((group, idx) => ({ group, idx }))
    .sort((a, b) => {
      const aRank = groupRank.has(a.group.name) ? groupRank.get(a.group.name) : Number.MAX_SAFE_INTEGER;
      const bRank = groupRank.has(b.group.name) ? groupRank.get(b.group.name) : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.idx - b.idx;
    })
    .map(x => x.group);
  const totalSelected = Object.values(sel).reduce((a, arr) => a + arr.length, 0);

  const toggleOpen = (name) => setLabOpenGroups(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const toggleMarker = (groupName, markerName) => {
    uS(s => {
      if (!s.labOrderSelected) s.labOrderSelected = {};
      const arr = [...(s.labOrderSelected[groupName] || [])];
      const idx = arr.indexOf(markerName);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(markerName);
      if (arr.length) s.labOrderSelected[groupName] = arr;
      else delete s.labOrderSelected[groupName];
    });
  };

  const setGroupAll = (groupName, markers, allSelected) => {
    uS(s => {
      if (!s.labOrderSelected) s.labOrderSelected = {};
      if (allSelected) delete s.labOrderSelected[groupName];
      else s.labOrderSelected[groupName] = [...markers];
    });
  };

  const clearAll = () => uS(s => { s.labOrderSelected = {}; });

  const toggleSimpleGroup = (groupName) => {
    uS(s => {
      if (!s.labOrderSelected) s.labOrderSelected = {};
      if ((s.labOrderSelected[groupName] || []).length) delete s.labOrderSelected[groupName];
      else s.labOrderSelected[groupName] = [groupName];
    });
  };
  const moveLabGroup = (fromIndex, targetIndex, position = "before") => {
    if (fromIndex == null || targetIndex == null) return;
    let insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
    if (fromIndex < insertIndex) insertIndex -= 1;
    if (fromIndex === insertIndex) return;
    if (fromIndex < 0 || targetIndex < 0 || fromIndex >= groups.length || targetIndex >= groups.length) return;
    const reordered = [...groups];
    const [moved] = reordered.splice(fromIndex, 1);
    if (!moved) return;
    reordered.splice(insertIndex, 0, moved);
    const nextOrder = reordered.map(g => g.name);
    uS(s => {
      const prev = Array.isArray(s.labOrderGroupOrder) ? s.labOrderGroupOrder : [];
      const same = prev.length === nextOrder.length && prev.every((name, idx) => name === nextOrder[idx]);
      if (!same) s.labOrderGroupOrder = nextOrder;
    });
  };
  const handleLabDragEnd = () => {
    setDragLabIndex(null);
    setDragLabOver(null);
  };
  const handleLabDragStart = (event, groupIndex) => {
    setDragLabIndex(groupIndex);
    setDragLabOver({ index: groupIndex, position: "before" });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(groupIndex));
  };
  const handleLabDragOver = (event, groupIndex) => {
    if (dragLabIndex == null || dragLabIndex === groupIndex) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position = (event.clientY - rect.top) > (rect.height / 2) ? "after" : "before";
    if (!dragLabOver || dragLabOver.index !== groupIndex || dragLabOver.position !== position) {
      setDragLabOver({ index: groupIndex, position });
    }
  };
  const handleLabDrop = (event, groupIndex) => {
    event.preventDefault();
    moveLabGroup(dragLabIndex, groupIndex, dragLabOver?.index === groupIndex ? dragLabOver.position : "before");
    handleLabDragEnd();
  };

  const exportPdf = () => {
    const items = getSelectedLabOrderItems(groups, sel);
    if (!items.length) { alert("Не выбрано ни одного анализа"); return; }
    const w = window.open("", "_blank");
    w.document.write(buildLabOrderPrintDocument({
      clientName: cl.name,
      clientDob: cl.dob,
      date: todayLabel(),
      items,
    }));
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div>
      <LabOrderHeaderCard
        totalSelected={totalSelected}
        onClear={clearAll}
        onExportPdf={exportPdf}
      />

      {groups.map((group, gi) => {
        const groupSel = sel[group.name] || [];
        const isDragSource = dragLabIndex === gi;
        const isDropTarget = dragLabIndex !== null && dragLabOver?.index === gi && dragLabIndex !== gi;
        const dropPosition = isDropTarget ? dragLabOver?.position : "before";
        return (
          <LabOrderGroupCard
            key={group.name}
            group={group}
            groupIndex={gi}
            selectedMarkers={groupSel}
            open={labOpenGroups.has(group.name)}
            dragSource={isDragSource}
            dropTarget={isDropTarget}
            dropPosition={dropPosition}
            onDragStart={handleLabDragStart}
            onDragEnd={handleLabDragEnd}
            onDragOver={handleLabDragOver}
            onDrop={handleLabDrop}
            onToggleOpen={toggleOpen}
            onToggleSimple={toggleSimpleGroup}
            onSetGroupAll={setGroupAll}
            onToggleMarker={toggleMarker}
          />
        );
      })}
    </div>
  );
}
