import { useState } from "react";
import { normalizeLabOrderTemplates } from "../utils/labOrderUtils";

export default function LabOrderSection({
  st,
  card,
  $,
  bt,
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

  const calcAge = (dob) => {
    if (!dob) return null;
    const d = String(dob).trim();
    let day, month, year;
    const m1 = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    const m2 = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m1) { day = +m1[1]; month = +m1[2] - 1; year = +m1[3]; }
    else if (m2) { day = +m2[3]; month = +m2[2] - 1; year = +m2[1]; }
    else return null;
    const now = new Date();
    let age = now.getFullYear() - year;
    if (now < new Date(now.getFullYear(), month, day)) age--;
    return age;
  };

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

  const exportPdf = () => {
    const age = calcAge(cl.dob);
    const ageStr = age != null ? `${age} лет` : "—";
    const date = todayLabel();
    const items = [];
    for (const g of groups) {
      const gSel = sel[g.name] || [];
      if (!gSel.length) continue;
      const isSimpleGroup = !!g.simple;
      if (isSimpleGroup) items.push(g.name);
      else items.push(...gSel);
    }
    if (!items.length) { alert("Не выбрано ни одного анализа"); return; }
    const half = Math.ceil(items.length / 2);
    const makeCol = (arr, start) => `<ol>${arr.map((m, i) => `<li><span class="n">${start + i + 1}.</span><span class="t">${m}</span></li>`).join("")}</ol>`;
    const listHtml = `<div class="cols"><div class="col">${makeCol(items.slice(0, half), 0)}</div><div class="col">${makeCol(items.slice(half), half)}</div></div>`;
    const css = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',-apple-system,Arial,sans-serif;background:#fff;color:#1a1f2e;font-size:13px;line-height:1.6}@page{margin:0;size:A4 portrait}.page{padding:14mm 18mm}.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid #e8eaf0}.title{font-size:19px;font-weight:700;color:#1a1f2e;letter-spacing:-.3px;margin-bottom:5px}.mr{font-size:12px;color:#6b7a99;margin-top:2px}.cl-name{font-size:13px;font-weight:700;color:#1a1f2e;margin-top:4px}.meta{text-align:right;font-size:12px;color:#6b7a99;line-height:1.9}.badge{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#6b7a99;border:1px solid #e8eaf0;padding:3px 10px;border-radius:4px;margin-bottom:8px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:flex-start}.col{}ol{list-style:none;padding:0;margin:0}ol li{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f0f2f6;align-items:baseline;page-break-inside:avoid;break-inside:avoid}.n{font-size:10px;font-weight:600;color:#6b7a99;min-width:18px;flex-shrink:0}.t{font-size:12px;color:#1a1f2e;line-height:1.35}.ftr{margin-top:18px;padding-top:10px;border-top:1px solid #e8eaf0;display:flex;justify-content:space-between;font-size:10px;color:#6b7a99;letter-spacing:.3px}`;
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Направление — ${cl.name}</title><style>${css}</style></head><body><div class="page"><div class="hdr"><div><div class="title">Направление на анализы</div><div class="cl-name">${cl.name}</div><div class="mr">Возраст: ${ageStr}</div></div><div class="meta"><div class="badge">Лаборатория</div><div>${date}</div></div></div>${listHtml}<div class="ftr"><span>Направление на анализы</span><span>${cl.name} · ${date}</span></div></div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div>
      <div style={{ ...card({ marginBottom: 14 }), display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>🔬 Направление на анализы</div>
          <div style={{ fontSize: 11, color: $.txM, marginTop: 3 }}>
            {totalSelected > 0 ? `Выбрано ${totalSelected} анализов` : "Отметьте нужные анализы — клиент получит PDF со списком"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {totalSelected > 0 && <button onClick={clearAll} style={{ ...bt("g"), fontSize: 11, color: $.dn, borderColor: $.dn }}>Очистить</button>}
          <button onClick={exportPdf} style={bt()} disabled={!totalSelected}>📄 Выгрузить PDF</button>
        </div>
      </div>

      {groups.map((group, gi) => {
        const groupSel = sel[group.name] || [];
        const cnt = groupSel.length;
        const isSimple = !!group.simple;
        const isDragSource = dragLabIndex === gi;
        const isDropTarget = dragLabIndex !== null && dragLabOver?.index === gi && dragLabIndex !== gi;
        const dropPosition = isDropTarget ? dragLabOver?.position : "before";

        if (isSimple) {
          const isChecked = cnt > 0;
          return (
            <div
              key={group.name}
              onDragOver={(e) => {
                if (dragLabIndex == null || dragLabIndex === gi) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientY - rect.top) > (rect.height / 2) ? "after" : "before";
                if (!dragLabOver || dragLabOver.index !== gi || dragLabOver.position !== pos) {
                  setDragLabOver({ index: gi, position: pos });
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                moveLabGroup(dragLabIndex, gi, dragLabOver?.index === gi ? dragLabOver.position : "before");
                handleLabDragEnd();
              }}
              style={{
                ...card({ marginBottom: 8 }),
                padding: 0,
                overflow: "hidden",
                position: "relative",
                opacity: isDragSource ? 0.65 : 1,
                boxShadow: isDropTarget ? `0 0 0 1px ${$.ac} inset` : "none",
                transition: "box-shadow .12s ease, opacity .12s ease"
              }}
            >
              {isDropTarget && (
                <div
                  style={{
                    position: "absolute",
                    left: 12,
                    right: 12,
                    height: 3,
                    borderRadius: 999,
                    background: $.ac,
                    pointerEvents: "none",
                    ...(dropPosition === "after" ? { bottom: 0 } : { top: 0 })
                  }}
                />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: isChecked ? $.acD : "transparent", transition: "background .15s" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer" }}>
                  <input type="checkbox" checked={isChecked} onChange={() => toggleSimpleGroup(group.name)} style={{ width: 15, height: 15, cursor: "pointer", accentColor: $.ac, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: isChecked ? $.ac : $.tx }}>{group.name}</span>
                </label>
                <span
                  draggable
                  onDragStart={(e) => {
                    setDragLabIndex(gi);
                    setDragLabOver({ index: gi, position: "before" });
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(gi));
                  }}
                  onDragEnd={handleLabDragEnd}
                  onClick={(e) => e.stopPropagation()}
                  title="Перетащить блок"
                  style={{ fontSize: 14, letterSpacing: 1, color: $.txM, cursor: "grab", userSelect: "none", lineHeight: 1 }}
                >
                  ⋮⋮
                </span>
              </div>
            </div>
          );
        }

        const isOpen = labOpenGroups.has(group.name);
        const allSelected = group.markers.length > 0 && cnt === group.markers.length;
        const someSelected = cnt > 0 && !allSelected;
        return (
          <div
            key={group.name}
            onDragOver={(e) => {
              if (dragLabIndex == null || dragLabIndex === gi) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = (e.clientY - rect.top) > (rect.height / 2) ? "after" : "before";
              if (!dragLabOver || dragLabOver.index !== gi || dragLabOver.position !== pos) {
                setDragLabOver({ index: gi, position: pos });
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              moveLabGroup(dragLabIndex, gi, dragLabOver?.index === gi ? dragLabOver.position : "before");
              handleLabDragEnd();
            }}
            style={{
              ...card({ marginBottom: 8 }),
              padding: 0,
              overflow: "hidden",
              position: "relative",
              opacity: isDragSource ? 0.65 : 1,
              boxShadow: isDropTarget ? `0 0 0 1px ${$.ac} inset` : "none",
              transition: "box-shadow .12s ease, opacity .12s ease"
            }}
          >
            {isDropTarget && (
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  right: 12,
                  height: 3,
                  borderRadius: 999,
                  background: $.ac,
                  pointerEvents: "none",
                  ...(dropPosition === "after" ? { bottom: 0 } : { top: 0 })
                }}
              />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: isOpen ? `1px solid ${$.brd}` : "none", background: cnt > 0 ? $.acD : "transparent", transition: "background .15s" }}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected; }}
                onChange={() => setGroupAll(group.name, group.markers, allSelected)}
                onClick={e => e.stopPropagation()}
                style={{ width: 15, height: 15, cursor: "pointer", accentColor: $.ac, flexShrink: 0 }}
              />
              <div onClick={() => toggleOpen(group.name)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: cnt > 0 ? $.ac : $.tx }}>{group.name}</span>
                {cnt > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: $.ac, color: "#fff" }}>{cnt}</span>}
              </div>
              <div onClick={() => toggleOpen(group.name)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: $.txM }}>{group.markers.length} пок.</span>
                <span style={{ fontSize: 11, color: $.txM }}>{isOpen ? "▲" : "▼"}</span>
              </div>
              <span
                draggable
                onDragStart={(e) => {
                  setDragLabIndex(gi);
                  setDragLabOver({ index: gi, position: "before" });
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(gi));
                }}
                onDragEnd={handleLabDragEnd}
                onClick={(e) => e.stopPropagation()}
                title="Перетащить блок"
                style={{ fontSize: 14, letterSpacing: 1, color: $.txM, cursor: "grab", userSelect: "none", lineHeight: 1 }}
              >
                ⋮⋮
              </span>
            </div>
            {isOpen && <div style={{ padding: "10px 14px 12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 2 }}>
                {group.markers.map(marker => {
                  const isChecked = groupSel.includes(marker);
                  return (
                    <label key={marker} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6, cursor: "pointer", background: isChecked ? $.acD : "transparent", fontSize: 12, transition: "background .1s" }}>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleMarker(group.name, marker)} style={{ width: 13, height: 13, cursor: "pointer", accentColor: $.ac, flexShrink: 0 }} />
                      <span style={{ color: isChecked ? $.ac : $.tx, lineHeight: 1.3 }}>{marker}</span>
                    </label>
                  );
                })}
              </div>
            </div>}
          </div>
        );
      })}
    </div>
  );
}
