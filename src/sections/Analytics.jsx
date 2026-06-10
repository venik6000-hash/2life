import { useEffect, useRef, useState, useCallback } from "react";
import { normalizeAnalyticsKey, getAnalyticsMarkerDefaults } from "../data/analyticsData";
import { getDisplayedAnalyticsDates } from "../utils/analyticsUtils";
import { useAuth } from "../context/AuthContext";
import { isClientRole } from "../context/DashboardContext";
import { useTheme } from "../context/ThemeContext";
import AnalyticsFilesPanel from "../components/AnalyticsFilesPanel";
import AnalyticsPanel from "../components/AnalyticsPanel";
import Card from "../components/Card";
import Wrapper from "../components/Wrapper";

function AnalyticsTabHeader({ activeTab, onSelect }) {
  const { $ } = useTheme();

  const pill = (active) => ({
    padding: "5px 10px",
    borderRadius: 999,
    border: `1px solid ${active ? $.ac : $.brd}`,
    background: active ? `${$.ac}22` : $.bgI,
    color: active ? $.ac : $.txS,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    fontFamily: "inherit",
  });

  return (
    <Wrapper marginBottom={12}>
      <Card size="md">
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button style={pill(activeTab === "table")} onClick={() => onSelect("table")}>
            📊 Таблица
          </button>
          <button style={pill(activeTab === "files")} onClick={() => onSelect("files")}>
            📁 Файлы анализов
          </button>
        </div>
      </Card>
    </Wrapper>
  );
}

export default function AnalyticsSection({
  st,
  clientId,
  collapseStorageKey,
  uS,
  analyticsJump,
  setAnalyticsJump,
  todayLabel,
  importStageExcel,
  canImportData,
  readOnly = false,
}) {
  const { authFetch, user } = useAuth();
  const isClient = isClientRole(user);
  const [anaEdit, setAnaEdit] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState("table");
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [dragAnalyticsIndex, setDragAnalyticsIndex] = useState(null);
  const [dragAnalyticsOver, setDragAnalyticsOver] = useState(null);
  const [analyticsFiles, setAnalyticsFiles] = useState([]);
  const [analyticsFilesLoading, setAnalyticsFilesLoading] = useState(false);
  const analyticsTableScrollRef = useRef(null);
  const analyticsDateInputRef = useRef(null);
  const canMutate = !readOnly;
  const collapsedStorageId = `dash_analytics_collapsed:${collapseStorageKey || "global"}`;
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
  const handleAnalyticsDragStart = (event, categoryIndex) => {
    if (!canMutate) return;
    setDragAnalyticsIndex(categoryIndex);
    setDragAnalyticsOver({ index: categoryIndex, position: "before" });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(categoryIndex));
  };
  const handleAnalyticsDragOver = (event, categoryIndex) => {
    if (!canMutate) return;
    if (dragAnalyticsIndex == null || dragAnalyticsIndex === categoryIndex) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position = (event.clientY - rect.top) > (rect.height / 2) ? "after" : "before";
    if (!dragAnalyticsOver || dragAnalyticsOver.index !== categoryIndex || dragAnalyticsOver.position !== position) {
      setDragAnalyticsOver({ index: categoryIndex, position });
    }
  };
  const handleAnalyticsDrop = (event, categoryIndex) => {
    if (!canMutate) return;
    event.preventDefault();
    moveAnalyticsCategory(dragAnalyticsIndex, categoryIndex, dragAnalyticsOver?.index === categoryIndex ? dragAnalyticsOver.position : "before");
    handleAnalyticsDragEnd();
  };
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
  const renameCategory = (categoryIndex, value) => uS(s => {
    s.analyticsCategories[categoryIndex].name = value;
  });
  const removeCategory = (categoryIndex) => uS(s => {
    s.analyticsCategories.splice(categoryIndex, 1);
  });
  const renameMarker = (categoryIndex, markerIndex, value) => uS(s => {
    s.analyticsCategories[categoryIndex].markers[markerIndex].name = value;
  });
  const saveMarkerField = (categoryIndex, markerIndex, field, value) => uS(s => {
    s.analyticsCategories[categoryIndex].markers[markerIndex][field] = value;
  });
  const saveMarkerValue = (categoryIndex, markerIndex, date, value) => uS(s => {
    const marker = s.analyticsCategories[categoryIndex].markers[markerIndex];
    let found = marker.values.find(item => item.date === date);
    if (!found) {
      found = { date, value: "", flagOff: false };
      marker.values.push(found);
    }
    found.value = value === "" ? "" : isNaN(+value) ? value : +value;
  });
  const toggleValueFlag = (categoryIndex, markerIndex, date) => uS(s => {
    const found = s.analyticsCategories[categoryIndex].markers[markerIndex].values.find(item => item.date === date);
    if (found) found.flagOff = !found.flagOff;
  });
  const createValue = (categoryIndex, markerIndex, date) => uS(s => {
    const marker = s.analyticsCategories[categoryIndex].markers[markerIndex];
    const existing = marker.values.find(item => item.date === date);
    if (existing) existing.value = 0;
    else marker.values.push({ date, value: 0, flagOff: false });
  });
  const removeMarker = (categoryIndex, markerIndex) => uS(s => {
    s.analyticsCategories[categoryIndex].markers.splice(markerIndex, 1);
  });
  const addMarker = (categoryIndex) => uS(s => {
    s.analyticsCategories[categoryIndex].markers.push({
      name: "Новый",
      unit: "",
      refMin: 0,
      refMax: 0,
      optimal: "",
      values: allD.map(date => ({ date, value: "", flagOff: false })),
    });
  });
  const addCategory = () => uS(s => {
    s.analyticsCategories.push({ name: "Новая категория", markers: [] });
  });
  const importAnalyticsFile = async (file) => {
    try {
      await importStageExcel(file, "analytics");
    } catch (error) {
      alert(`Ошибка загрузки: ${error.message}`);
    }
  };

  // ─── Files tab ──────────────────────────────────────────────────────────────

  const loadAnalyticsFiles = useCallback(async () => {
    if (!clientId) return;
    setAnalyticsFilesLoading(true);
    try {
      const res = await authFetch(`/api/clients/${encodeURIComponent(clientId)}/analytics-files`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setAnalyticsFiles(data);
    } catch (_) {
    } finally {
      setAnalyticsFilesLoading(false);
    }
  }, [authFetch, clientId]);

  const uploadAnalyticsFile = async (file) => {
    if (!clientId) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await authFetch(`/api/clients/${encodeURIComponent(clientId)}/analytics-files`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Ошибка загрузки файла");
        return;
      }
      const record = await res.json();
      setAnalyticsFiles(prev => [record, ...prev]);
    } catch (e) {
      alert(`Ошибка: ${e.message}`);
    }
  };

  const updateAnalyticsFileField = async (id, field, value) => {
    if (!clientId) return;
    try {
      const res = await authFetch(`/api/clients/${encodeURIComponent(clientId)}/analytics-files/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setAnalyticsFiles(prev => prev.map(f => f.id === id ? updated : f));
    } catch (_) {}
  };

  const removeAnalyticsFile = async (id) => {
    if (!clientId) return;
    if (!window.confirm("Удалить файл?")) return;
    try {
      const res = await authFetch(`/api/clients/${encodeURIComponent(clientId)}/analytics-files/${id}`, {
        method: "DELETE",
      });
      if (res.ok) setAnalyticsFiles(prev => prev.filter(f => f.id !== id));
    } catch (_) {}
  };

  const downloadAnalyticsFile = async (id, filename) => {
    if (!clientId) return;
    try {
      const res = await authFetch(`/api/clients/${encodeURIComponent(clientId)}/analytics-files/${id}/download`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "file";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (_) {}
  };

  // ─── Effects ─────────────────────────────────────────────────────────────────

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

  useEffect(() => {
    if (analyticsTab === "files") loadAnalyticsFiles();
  }, [analyticsTab, clientId, loadAnalyticsFiles]);

  return (
    <div>
      {!isClient && <AnalyticsTabHeader activeTab={analyticsTab} onSelect={setAnalyticsTab} />}

      {!isClient && analyticsTab === "files" ? (
        <AnalyticsFilesPanel
          files={analyticsFiles}
          loading={analyticsFilesLoading}
          readOnly={readOnly}
          onUpload={uploadAnalyticsFile}
          onUpdateField={updateAnalyticsFileField}
          onDelete={removeAnalyticsFile}
          onDownload={downloadAnalyticsFile}
        />
      ) : (
        <AnalyticsPanel
          categories={cats}
          dates={allD}
          editMode={anaEdit}
          canMutate={canMutate}
          readOnly={readOnly}
          canImportData={canImportData}
          analyticsJump={analyticsJump}
          tableScrollRef={analyticsTableScrollRef}
          dateInputRef={analyticsDateInputRef}
          collapsedCategories={collapsedCategories}
          dragIndex={dragAnalyticsIndex}
          dragOver={dragAnalyticsOver}
          getCollapseKey={getCollapseKey}
          onToggleEdit={() => setAnaEdit(!anaEdit)}
          onDateInputChange={(isoValue) => {
            const formatted = isoToAnalyticsDate(isoValue);
            if (formatted) addAnalyticsDate(formatted);
          }}
          onScrollTable={(event) => localStorage.setItem("dash_analytics_scroll_x", String(event.currentTarget.scrollLeft))}
          onToggleCategoryCollapsed={toggleCategoryCollapsed}
          onDragStart={handleAnalyticsDragStart}
          onDragEnd={handleAnalyticsDragEnd}
          onDragOver={handleAnalyticsDragOver}
          onDrop={handleAnalyticsDrop}
          onRenameCategory={renameCategory}
          onRemoveCategory={removeCategory}
          onRenameDate={renameAnalyticsDate}
          onDeleteDate={deleteAnalyticsDate}
          onOpenDatePicker={openAnalyticsDatePicker}
          onRenameMarker={renameMarker}
          onSaveMarkerField={saveMarkerField}
          onSaveMarkerValue={saveMarkerValue}
          onToggleValueFlag={toggleValueFlag}
          onCreateValue={createValue}
          onRemoveMarker={removeMarker}
          onAddMarker={addMarker}
          onAddCategory={addCategory}
          onAddTemplateGroup={addAnalyticsTemplateGroup}
          onImportFile={importAnalyticsFile}
        />
      )}
    </div>
  );
}
