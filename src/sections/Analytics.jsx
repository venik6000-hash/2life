import { useEffect, useRef, useState } from "react";
import { ANALYTICS_GROUP_TEMPLATES, normalizeAnalyticsKey, getAnalyticsMarkerDefaults } from "../data/analyticsData";
import { getMarkerStatus, getDisplayedAnalyticsDates } from "../utils/analyticsUtils";
import Ed from "../components/Ed";
import Badge from "../components/Badge";

export default function AnalyticsSection({
  st,
  collapseStorageKey,
  card,
  $, 
  bt,
  uS,
  analyticsJump,
  setAnalyticsJump,
  todayLabel,
  importStageExcel,
  canImportData,
  readOnly = false,
}) {
  const [anaEdit, setAnaEdit] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [dragAnalyticsIndex, setDragAnalyticsIndex] = useState(null);
  const [dragAnalyticsOver, setDragAnalyticsOver] = useState(null);
  const analyticsTableScrollRef = useRef(null);
  const analyticsDateInputRef = useRef(null);
  const canMutate = !readOnly;
  const collapsedStorageId = `dash_analytics_collapsed:${collapseStorageKey || "global"}`;
  const analyticsFlash = analyticsJump ? `0 0 0 9999px ${$.wrD} inset, 0 0 0 1px ${$.wr} inset` : "none";
  const cats = st.analyticsCategories || [];
  const allD = getDisplayedAnalyticsDates(cats);
  const getCollapseKey = (cat, ci) => normalizeAnalyticsKey(cat?.name) || `idx-${ci}`;
  const toggleCategoryCollapsed = (cat, ci) => {
    const key = getCollapseKey(cat, ci);
    setCollapsedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const moveAnalyticsCategory = (fromIndex, targetIndex, position = "before") => {
    if (!canMutate) return;
    if (fromIndex == null || targetIndex == null) return;
    let insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
    if (fromIndex < insertIndex) insertIndex -= 1;
    if (fromIndex === insertIndex) return;
    uS(s => {
      const arr = s.analyticsCategories || (s.analyticsCategories = []);
      if (fromIndex < 0 || fromIndex >= arr.length || insertIndex < 0 || insertIndex > arr.length) return;
      const [moved] = arr.splice(fromIndex, 1);
      if (!moved) return;
      arr.splice(insertIndex, 0, moved);
    });
  };
  const handleAnalyticsDragEnd = () => {
    setDragAnalyticsIndex(null);
    setDragAnalyticsOver(null);
  };
  const gs = (m, val) => getMarkerStatus(m, val);
  const sty = s => s === "hi" ? { background: $.dnD, color: $.dn, fontWeight: 700 } : s === "lo" ? { background: $.inD, color: $.in, fontWeight: 700 } : s === "bd" ? { background: $.wrD, color: $.wr, fontWeight: 600 } : {};
  const ci_inp = { padding: "4px 6px", borderRadius: 4, border: `1px solid ${$.brd}`, background: $.bgI, color: $.tx, fontSize: 12, fontFamily: "inherit", outline: "none", width: "100%", textAlign: "center" };
  const BlurIn = ({ val, onSave, style: st2 }) => <input defaultValue={val} onBlur={e => onSave(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} style={{ ...ci_inp, ...st2 }} />;
  const todayIso = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };
  const isoToAnalyticsDate = (iso) => {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return `${m[3]}.${m[2]}.${m[1]}`;
  };
  const addAnalyticsDate = (dateRaw) => {
    if (!canMutate) return;
    const date = String(dateRaw || "").trim();
    if (!date) return;
    uS(s => {
      s.analyticsCategories.forEach(c2 => {
        c2.markers.forEach(m2 => {
          if (!m2.values.find(v => v.date === date)) m2.values.push({ date, value: "", flagOff: false });
        });
      });
    });
  };
  const openAnalyticsDatePicker = () => {
    const input = analyticsDateInputRef.current;
    if (!input) return;
    input.value = todayIso();
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  };
  const renameAnalyticsDate = (oldDate, newDate) => {
    if (!canMutate) return;
    const nextDate = String(newDate || "").trim();
    if (!nextDate || nextDate === oldDate) return;
    uS(s => {
      s.analyticsCategories.forEach(cat2 => {
        cat2.markers.forEach(marker => {
          const existing = marker.values.find(v => v.date === nextDate);
          marker.values.forEach(v => {
            if (v.date === oldDate) v.date = nextDate;
          });
          if (existing) {
            marker.values = marker.values.filter((v, idx, arr) => {
              if (v.date !== nextDate) return true;
              return arr.findIndex(x => x.date === nextDate) === idx;
            });
          }
        });
      });
    });
  };
  const deleteAnalyticsDate = (dateToDelete) => {
    if (!canMutate) return;
    if (!dateToDelete) return;
    if (!window.confirm(`Удалить дату ${dateToDelete} из всех категорий анализов?`)) return;
    uS(s => {
      s.analyticsCategories.forEach(cat2 => {
        cat2.markers.forEach(marker => {
          marker.values = marker.values.filter(v => v.date !== dateToDelete);
        });
      });
    });
    if (analyticsJump?.date === dateToDelete) setAnalyticsJump(null);
  };
  const addAnalyticsTemplateGroup = (tpl) => {
    if (!canMutate) return;
    if (!tpl?.name || !Array.isArray(tpl.markers) || !tpl.markers.length) return;
    let addedMarkers = 0;
    let createdCategory = false;
    let todayDateAdded = false;

    uS(s => {
      const catsList = s.analyticsCategories || (s.analyticsCategories = []);
      const todayDate = todayLabel();

      catsList.forEach(cat => {
        (cat.markers || []).forEach(marker => {
          marker.values = marker.values || [];
          if (!marker.values.find(v => v.date === todayDate)) {
            marker.values.push({ date: todayDate, value: "", flagOff: false });
            todayDateAdded = true;
          }
        });
      });

      const allDates = getDisplayedAnalyticsDates(catsList);
      const markerDates = allDates.length ? allDates : [todayDate];
      const sameCategory = catsList.find(c => normalizeAnalyticsKey(c.name) === normalizeAnalyticsKey(tpl.name));
      const makeMarker = (name) => {
        const defaults = getAnalyticsMarkerDefaults(tpl.name, name);
        return {
          name,
          unit: defaults.unit,
          refMin: defaults.refMin,
          refMax: defaults.refMax,
          optimal: "",
          values: markerDates.map(d => ({ date: d, value: "", flagOff: false }))
        };
      };

      if (!sameCategory) {
        catsList.push({
          name: tpl.name,
          markers: tpl.markers.map(makeMarker)
        });
        createdCategory = true;
        addedMarkers = tpl.markers.length;
        return;
      }

      const existing = new Set((sameCategory.markers || []).map(m => normalizeAnalyticsKey(m.name)));
      tpl.markers.forEach(markerName => {
        const key = normalizeAnalyticsKey(markerName);
        if (!key || existing.has(key)) return;
        sameCategory.markers.push(makeMarker(markerName));
        existing.add(key);
        addedMarkers += 1;
      });
    });

    if (addedMarkers === 0) {
      if (todayDateAdded) {
        alert(`Сегодняшняя дата добавлена: ${todayLabel()}.`);
        return;
      }
      alert(`Группа «${tpl.name}» уже добавлена полностью.`);
      return;
    }
    alert(
      createdCategory
        ? `Добавлена группа «${tpl.name}» (${addedMarkers} маркеров). Дата: ${todayLabel()}.`
        : `Группа «${tpl.name}» дополнена (+${addedMarkers} маркеров). Дата: ${todayLabel()}.`
    );
  };

  useEffect(()=>{
    const x = Number(localStorage.getItem("dash_analytics_scroll_x") || 0);
    requestAnimationFrame(()=>{
      if(analyticsTableScrollRef.current) analyticsTableScrollRef.current.scrollLeft = x;
    });
  }, [st?.analyticsCategories?.length]);

  useEffect(()=>{
    if(!analyticsJump) return;
    const markerKey = analyticsJump.markerKey || `${String(analyticsJump.categoryName||"").toLowerCase()}::${String(analyticsJump.markerName||"").toLowerCase()}`;
    let tries = 0;
    const jumpToRow = () => {
      const row = document.querySelector(`[data-marker-key="${CSS.escape(markerKey)}"]`);
      if(row){ row.scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"}); return; }
      if(tries < 10){ tries += 1; setTimeout(jumpToRow, 80); }
    };
    requestAnimationFrame(jumpToRow);
  }, [analyticsJump, st?.analyticsCategories?.length]);

  useEffect(() => {
    if (readOnly && anaEdit) setAnaEdit(false);
  }, [readOnly, anaEdit]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(collapsedStorageId);
      if (!raw) {
        setCollapsedCategories({});
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setCollapsedCategories(parsed);
        return;
      }
      setCollapsedCategories({});
    } catch (_) {
      setCollapsedCategories({});
    }
  }, [collapsedStorageId]);

  useEffect(() => {
    try {
      localStorage.setItem(collapsedStorageId, JSON.stringify(collapsedCategories || {}));
    } catch (_) {}
  }, [collapsedCategories, collapsedStorageId]);

  return (
    <div>
      <input
        ref={analyticsDateInputRef}
        type="date"
        onChange={e => {
          const formatted = isoToAnalyticsDate(e.target.value);
          if (formatted) addAnalyticsDate(formatted);
        }}
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
      />
      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {canMutate && <button onClick={() => setAnaEdit(!anaEdit)} style={{ ...bt(anaEdit ? "ac" : "g"), fontSize: 11 }}>{anaEdit ? "✓ Готово" : "✏️ Редактировать всё"}</button>}
        <span style={{ fontSize: 12, color: $.txM }}>Легенда:</span>
        <Badge c="dn" ch="▲ Выше нормы" /><Badge c="in" ch="▼ Ниже нормы" /><Badge c="wr" ch="● Пограничный" /><Badge c="ac" ch="✓ Оптимум" />
        {!anaEdit && canMutate && <span style={{ fontSize: 11, color: $.txM }}>• Клик на цветную ячейку снимает/ставит пометку</span>}
      </div>
      <div ref={analyticsTableScrollRef} onScroll={e => localStorage.setItem("dash_analytics_scroll_x", String(e.currentTarget.scrollLeft))} style={{ width: "100%", maxWidth: "100%", overflowX: "scroll", overflowY: "hidden", display: "block", WebkitOverflowScrolling: "touch", touchAction: "pan-x", paddingBottom: 6 }}>
        <div style={{ width: "max-content", minWidth: "100%" }}>
          {cats.map((cat, ci) => {
            const collapseKey = getCollapseKey(cat, ci);
            const isCollapsed = !!collapsedCategories[collapseKey];
            const isDragSource = dragAnalyticsIndex === ci;
            const isDropTarget = dragAnalyticsIndex !== null && dragAnalyticsOver?.index === ci && dragAnalyticsIndex !== ci;
            const dropPosition = isDropTarget ? dragAnalyticsOver?.position : "before";
            return (
            <div
              key={ci}
              onDragOver={(e) => {
                if (!canMutate) return;
                if (dragAnalyticsIndex == null || dragAnalyticsIndex === ci) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientY - rect.top) > (rect.height / 2) ? "after" : "before";
                if (!dragAnalyticsOver || dragAnalyticsOver.index !== ci || dragAnalyticsOver.position !== pos) {
                  setDragAnalyticsOver({ index: ci, position: pos });
                }
              }}
              onDrop={(e) => {
                if (!canMutate) return;
                e.preventDefault();
                moveAnalyticsCategory(dragAnalyticsIndex, ci, dragAnalyticsOver?.index === ci ? dragAnalyticsOver.position : "before");
                handleAnalyticsDragEnd();
              }}
              style={{
                ...card({ marginBottom: 14, width: "100%" }),
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
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: !isCollapsed ? `1px solid ${$.brd}` : "none", background: "transparent", transition: "background .15s" }}>
                <div onClick={() => toggleCategoryCollapsed(cat, ci)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", minWidth: 0 }}>
                  <div onClick={anaEdit ? (e) => e.stopPropagation() : undefined} style={{ minWidth: 0, fontSize: 13, fontWeight: 600, color: $.tx, lineHeight: 1.3 }}>
                    {anaEdit
                      ? <Ed v={cat.name} f={`acn-${ci}`} save={v => uS(s => { s.analyticsCategories[ci].name = v; })} fontSize={13} />
                      : <span>{cat.name || <i style={{ color: $.txM }}>—</i>}</span>}
                  </div>
                </div>
                <div onClick={() => toggleCategoryCollapsed(cat, ci)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: $.txM }}>{cat.markers?.length || 0} пок.</span>
                  <span style={{ fontSize: 11, color: $.txM }}>{isCollapsed ? "▼" : "▲"}</span>
                </div>
                {canMutate && <span
                  draggable={canMutate}
                  onDragStart={(e) => {
                    if (!canMutate) return;
                    setDragAnalyticsIndex(ci);
                    setDragAnalyticsOver({ index: ci, position: "before" });
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(ci));
                  }}
                  onDragEnd={handleAnalyticsDragEnd}
                  onClick={(e) => e.stopPropagation()}
                  title="Перетащить категорию"
                  style={{ fontSize: 14, letterSpacing: 1, color: $.txM, cursor: canMutate ? "grab" : "default", userSelect: "none", lineHeight: 1, opacity: canMutate ? 1 : 0.45 }}
                >
                  ⋮⋮
                </span>}
                {canMutate && anaEdit && (
                  <button onClick={() => uS(s => { s.analyticsCategories.splice(ci, 1); })} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 11 }}>✕</button>
                )}
              </div>
              {!isCollapsed ? (
                <>
                  <div style={{ padding: "10px 14px 12px" }}>
                    <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead><tr>
                        <th style={{ padding: "7px 8px", textAlign: "left", borderBottom: `2px solid ${$.ac}`, position: "sticky", left: 0, background: $.bgC, zIndex: 2, minWidth: 150 }}>Показатель</th>
                        <th style={{ padding: "7px 8px", borderBottom: `2px solid ${$.ac}`, fontSize: 10, minWidth: 50 }}>Ед.</th>
                        <th style={{ padding: "7px 8px", borderBottom: `2px solid ${$.ac}`, fontSize: 10, minWidth: 65 }}>Норма</th>
                        <th style={{ padding: "7px 8px", borderBottom: `2px solid ${$.ac}`, fontSize: 10, color: $.ac, minWidth: 65 }}>Оптимум</th>
                        {allD.map(d => <th key={d} style={{ padding: "7px 8px", borderBottom: `2px solid ${$.ac}`, textAlign: "center", minWidth: 132, fontSize: 11, cursor: canMutate ? "pointer" : "default", verticalAlign: "top" }} onClick={() => { if (canMutate && !anaEdit) { const nd = prompt("Новая дата (дд.мм.гггг):", d); if (nd !== null) renameAnalyticsDate(d, nd); } }}>{anaEdit ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}><BlurIn val={d} onSave={v => renameAnalyticsDate(d, v)} style={{ minWidth: 110, fontWeight: 600 }} /><button onClick={e => { e.stopPropagation(); deleteAnalyticsDate(d); }} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 12, lineHeight: 1, padding: 0 }} title={`Удалить дату ${d}`}>✕</button></div> : <span>{d}</span>}</th>)}
                        <th style={{ padding: "7px 4px", borderBottom: `2px solid ${$.ac}`, minWidth: 24 }} />
                      </tr></thead>
                      <tbody>{cat.markers.map((m, mi) => (
                        <tr key={mi} data-marker-name={String(m.name || "").toLowerCase()} data-marker-key={`${String(cat.name || "").toLowerCase()}::${String(m.name || "").toLowerCase()}`} style={{ borderBottom: `1px solid ${$.brd}`, background: analyticsJump?.markerKey === `${String(cat.name || "").toLowerCase()}::${String(m.name || "").toLowerCase()}` ? $.wrD : "transparent", boxShadow: analyticsJump?.markerKey === `${String(cat.name || "").toLowerCase()}::${String(m.name || "").toLowerCase()}` ? analyticsFlash : "none", transition: "background 2s ease, box-shadow 2s ease" }}>
                          <td style={{ padding: "6px 8px", fontWeight: 600, position: "sticky", left: 0, background: $.bgC, zIndex: 1 }}>
                            {anaEdit
                              ? <BlurIn val={m.name} onSave={v => uS(s => { s.analyticsCategories[ci].markers[mi].name = v; })} style={{ textAlign: "left", fontWeight: 600 }} />
                              : <span style={{ lineHeight: 1.3 }}>{m.name || <i style={{ color: $.txM }}>—</i>}</span>}
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, color: $.txM }}>
                            {anaEdit ? <BlurIn val={m.unit} onSave={v => uS(s => { s.analyticsCategories[ci].markers[mi].unit = v; })} style={{ width: 50 }} /> : <Ed ro={readOnly} v={m.unit || ""} f={`amu-${ci}-${mi}`} save={v => uS(s => { s.analyticsCategories[ci].markers[mi].unit = v; })} />}
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, color: $.txM }}>
                            {anaEdit ? <span style={{ display: "flex", gap: 2, alignItems: "center" }}><BlurIn val={m.refMin} onSave={v => uS(s => { s.analyticsCategories[ci].markers[mi].refMin = isNaN(+v) ? 0 : +v; })} style={{ width: 45 }} />–<BlurIn val={m.refMax} onSave={v => uS(s => { s.analyticsCategories[ci].markers[mi].refMax = isNaN(+v) ? 0 : +v; })} style={{ width: 45 }} /></span> : <span><Ed ro={readOnly} v={String(m.refMin)} f={`amrn-${ci}-${mi}`} save={v => uS(s => { s.analyticsCategories[ci].markers[mi].refMin = isNaN(+v) ? 0 : +v; })} />–<Ed ro={readOnly} v={String(m.refMax)} f={`amrx-${ci}-${mi}`} save={v => uS(s => { s.analyticsCategories[ci].markers[mi].refMax = isNaN(+v) ? 0 : +v; })} /></span>}
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, color: $.ac, fontWeight: 600 }}>
                            {anaEdit ? <BlurIn val={m.optimal} onSave={v => uS(s => { s.analyticsCategories[ci].markers[mi].optimal = v; })} style={{ color: $.ac, fontWeight: 600 }} /> : <Ed ro={readOnly} v={m.optimal} f={`amo-${ci}-${mi}`} save={v => uS(s => { s.analyticsCategories[ci].markers[mi].optimal = v; })} />}
                          </td>
                          {allD.map(d => {
                            const vO = m.values.find(v => v.date === d);
                            const val = vO?.value;
                            const numVal = val != null && val !== "" ? +val : null;
                            const status = vO && !vO.flagOff && numVal !== null ? gs(m, numVal) : "none";
                            const cs = status !== "none" && status !== "ok" ? sty(status) : {};
                            if (anaEdit) {
                              return (
                                <td key={d} style={{ padding: "4px 4px", ...cs, borderRadius: 3 }}>
                                  <BlurIn val={vO ? val : ""} onSave={nv => { uS(s => { const mk = s.analyticsCategories[ci].markers[mi]; let found = mk.values.find(x => x.date === d); if (!found) { found = { date: d, value: "", flagOff: false }; mk.values.push(found); } found.value = nv === "" ? "" : isNaN(+nv) ? nv : +nv; }); }} style={status !== "none" && status !== "ok" ? { color: cs.color, fontWeight: 700 } : {}} />
                                </td>
                              );
                            }
                            return (
                              <td key={d} style={{ padding: "6px 8px", textAlign: "center", borderRadius: 3, ...cs, cursor: canMutate ? "pointer" : "default" }} onClick={() => { if (canMutate && vO) uS(s => { const v2 = s.analyticsCategories[ci].markers[mi].values.find(x => x.date === d); if (v2) v2.flagOff = !v2.flagOff; }); }}>
                                {val != null && val !== "" ? <Ed ro={readOnly} v={String(val)} f={`amv-${ci}-${mi}-${d}`} save={v => uS(s => { const f = s.analyticsCategories[ci].markers[mi].values.find(x => x.date === d); if (f) f.value = isNaN(+v) ? v : +v; })} /> : (canMutate ? <span style={{ cursor: "pointer", color: $.ac, fontWeight: 600 }} onClick={e => { e.stopPropagation(); uS(s => { const mk = s.analyticsCategories[ci].markers[mi]; const ex = mk.values.find(x => x.date === d); if (ex) { ex.value = 0; } else { mk.values.push({ date: d, value: 0, flagOff: false }); } }); }}>+</span> : <span style={{ color: $.txM }}>—</span>)}
                              </td>
                            );
                          })}
                          <td style={{ padding: "6px 4px" }}>{canMutate && <button onClick={() => uS(s => { s.analyticsCategories[ci].markers.splice(mi, 1); })} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 11 }}>✕</button>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  {canMutate && <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button onClick={() => uS(s => { s.analyticsCategories[ci].markers.push({ name: "Новый", unit: "", refMin: 0, refMax: 0, optimal: "", values: allD.map(d => ({ date: d, value: "", flagOff: false })) }); })} style={{ ...bt("g"), fontSize: 11 }}>+ Маркер</button>
                    <button onClick={openAnalyticsDatePicker} style={{ ...bt("g"), fontSize: 11, color: $.in }}>+ Дата</button>
                  </div>}
                </>
              ) : null}
            </div>
            );
          })}
        </div>
      </div>
      {canMutate && <button onClick={() => uS(s => { s.analyticsCategories.push({ name: "Новая категория", markers: [] }); })} style={bt("g")}>+ Категория анализов</button>}
      {canMutate && <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: $.txM, marginBottom: 6 }}>Быстро добавить группу анализов:</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ANALYTICS_GROUP_TEMPLATES.map(tpl => <button key={tpl.name} onClick={() => addAnalyticsTemplateGroup(tpl)} style={{ ...bt("g"), fontSize: 11, color: $.ac, borderColor: $.ac }}>+ {tpl.name}</button>)}
        </div>
      </div>}
      {canImportData && !readOnly && (
        <span style={{ marginLeft: 8 }}>
          <label style={{ ...bt("g"), color: $.ac, borderColor: $.ac, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
            📥 Загрузить карту анализов
            <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { await importStageExcel(file, "analytics"); } catch (err) { alert("Ошибка загрузки: " + err.message); } }} />
          </label>
        </span>
      )}
    </div>
  );
}
