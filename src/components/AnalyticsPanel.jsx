import { useTheme } from "../context/ThemeContext";
import { ANALYTICS_GROUP_TEMPLATES } from "../data/analyticsData";
import { getMarkerStatus } from "../utils/analyticsUtils";
import Badge from "./Badge";
import BlurInput from "./BlurInput";
import Button from "./Button";
import Card from "./Card";
import Ed from "./Ed";
import FileUploadButton from "./FileUploadButton";
import Wrapper from "./Wrapper";

const markerKeyFor = (categoryName, markerName) =>
  `${String(categoryName || "").toLowerCase()}::${String(markerName || "").toLowerCase()}`;

function AnalyticsHiddenDateInput({ inputRef, onChangeDate }) {
  return (
    <input
      ref={inputRef}
      type="date"
      onChange={event => onChangeDate(event.target.value)}
      tabIndex={-1}
      aria-hidden="true"
      style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
    />
  );
}

function AnalyticsToolbar({
  canMutate,
  editMode,
  canImportData,
  readOnly,
  onToggleEdit,
  onImportFile,
}) {
  const { $ } = useTheme();

  return (
    <>
      <Wrapper dir="row" gap="sm" wrap align="center" marginBottom={12}>
        {canMutate && (
          <Button variant={editMode ? "solid" : "ghost"} size="sm" onClick={onToggleEdit}>
            {editMode ? "✓ Готово" : "✏️ Редактировать всё"}
          </Button>
        )}
        <span style={{ fontSize: 12, color: $.txM }}>Легенда:</span>
        <Badge c="dn" ch="▲ Выше нормы" />
        <Badge c="in" ch="▼ Ниже нормы" />
        <Badge c="wr" ch="● Пограничный" />
        <Badge c="ac" ch="✓ Оптимум" />
        {!editMode && canMutate && <span style={{ fontSize: 11, color: $.txM }}>• Клик на цветную ячейку снимает/ставит пометку</span>}
      </Wrapper>
      {canImportData && !readOnly && (
        <Wrapper marginLeft={8} marginBottom={12}>
          <FileUploadButton accept=".xlsx,.xls" onSelect={onImportFile}>
            📥 Загрузить карту анализов
          </FileUploadButton>
        </Wrapper>
      )}
    </>
  );
}

function AnalyticsDropLine({ position }) {
  const { $ } = useTheme();

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        height: 3,
        borderRadius: 999,
        background: $.ac,
        pointerEvents: "none",
        ...(position === "after" ? { bottom: 0 } : { top: 0 }),
      }}
    />
  );
}

function AnalyticsCategoryHeader({
  category,
  categoryIndex,
  collapsed,
  editMode,
  canMutate,
  markerCount,
  onToggleCollapsed,
  onRenameCategory,
  onRemoveCategory,
  onDragStart,
  onDragEnd,
}) {
  const { $ } = useTheme();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: !collapsed ? `1px solid ${$.brd}` : "none", background: "transparent", transition: "background .15s" }}>
      <div onClick={onToggleCollapsed} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", minWidth: 0 }}>
        <div onClick={editMode ? (event) => event.stopPropagation() : undefined} style={{ minWidth: 0, fontSize: 13, fontWeight: 600, color: $.tx, lineHeight: 1.3 }}>
          {editMode
            ? <Ed value={category.name} editKey={`acn-${categoryIndex}`} onSave={onRenameCategory} />
            : <span>{category.name || <i style={{ color: $.txM }}>—</i>}</span>}
        </div>
      </div>
      <div onClick={onToggleCollapsed} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: $.txM }}>{markerCount} пок.</span>
        <span style={{ fontSize: 11, color: $.txM }}>{collapsed ? "▼" : "▲"}</span>
      </div>
      {canMutate && (
        <span
          draggable
          onDragStart={(event) => onDragStart(event, categoryIndex)}
          onDragEnd={onDragEnd}
          onClick={(event) => event.stopPropagation()}
          title="Перетащить категорию"
          style={{ fontSize: 14, letterSpacing: 1, color: $.txM, cursor: "grab", userSelect: "none", lineHeight: 1 }}
        >
          ⋮⋮
        </span>
      )}
      {canMutate && editMode && (
        <Button variant="bare" tone="danger" size="xs" onClick={onRemoveCategory}>✕</Button>
      )}
    </div>
  );
}

function AnalyticsTable({
  category,
  categoryIndex,
  dates,
  editMode,
  canMutate,
  readOnly,
  analyticsJump,
  onRenameDate,
  onDeleteDate,
  onOpenDatePicker,
  onRenameMarker,
  onSaveMarkerField,
  onSaveMarkerValue,
  onToggleValueFlag,
  onCreateValue,
  onRemoveMarker,
  onAddMarker,
}) {
  const { $ } = useTheme();
  const analyticsFlash = analyticsJump ? `0 0 0 9999px ${$.wrD} inset, 0 0 0 1px ${$.wr} inset` : "none";
  const statusStyle = (status) => {
    if (status === "hi") return { background: $.dnD, color: $.dn, fontWeight: 700 };
    if (status === "lo") return { background: $.inD, color: $.in, fontWeight: 700 };
    if (status === "bd") return { background: $.wrD, color: $.wr, fontWeight: 600 };
    return {};
  };

  return (
    <>
      <div style={{ padding: "10px 14px 12px" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ padding: "7px 8px", textAlign: "left", borderBottom: `2px solid ${$.ac}`, position: "sticky", left: 0, background: $.bgC, zIndex: 2, minWidth: 150 }}>Показатель</th>
              <th style={{ padding: "7px 8px", borderBottom: `2px solid ${$.ac}`, fontSize: 10, minWidth: 50 }}>Ед.</th>
              <th style={{ padding: "7px 8px", borderBottom: `2px solid ${$.ac}`, fontSize: 10, minWidth: 65 }}>Норма</th>
              <th style={{ padding: "7px 8px", borderBottom: `2px solid ${$.ac}`, fontSize: 10, color: $.ac, minWidth: 65 }}>Оптимум</th>
              {dates.map((date) => (
                <th
                  key={date}
                  style={{ padding: "7px 8px", borderBottom: `2px solid ${$.ac}`, textAlign: "center", minWidth: 132, fontSize: 11, cursor: canMutate ? "pointer" : "default", verticalAlign: "top" }}
                  onClick={() => {
                    if (!canMutate || editMode) return;
                    const nextDate = prompt("Новая дата (дд.мм.гггг):", date);
                    if (nextDate !== null) onRenameDate(date, nextDate);
                  }}
                >
                  {editMode ? (
                    <Wrapper gap={6} align="center">
                      <Wrapper width={110}>
                        <BlurInput val={date} onSave={(value) => onRenameDate(date, value)} bold />
                      </Wrapper>
                      <Button variant="bare" tone="danger" size="xs" onClick={(event) => { event.stopPropagation(); onDeleteDate(date); }} title={`Удалить дату ${date}`}>✕</Button>
                    </Wrapper>
                  ) : (
                    <span>{date}</span>
                  )}
                </th>
              ))}
              <th style={{ padding: "7px 4px", borderBottom: `2px solid ${$.ac}`, minWidth: 24 }} />
            </tr>
          </thead>
          <tbody>
            {(category.markers || []).map((marker, markerIndex) => {
              const rowKey = markerKeyFor(category.name, marker.name);
              const highlighted = analyticsJump?.markerKey === rowKey;
              return (
                <tr
                  key={markerIndex}
                  data-marker-name={String(marker.name || "").toLowerCase()}
                  data-marker-key={rowKey}
                  style={{ borderBottom: `1px solid ${$.brd}`, background: highlighted ? $.wrD : "transparent", boxShadow: highlighted ? analyticsFlash : "none", transition: "background 2s ease, box-shadow 2s ease" }}
                >
                  <td style={{ padding: "6px 8px", fontWeight: 600, position: "sticky", left: 0, background: $.bgC, zIndex: 1 }}>
                    {editMode
                      ? <BlurInput val={marker.name} onSave={(value) => onRenameMarker(markerIndex, value)} align="left" bold />
                      : <span style={{ lineHeight: 1.3 }}>{marker.name || <i style={{ color: $.txM }}>—</i>}</span>}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, color: $.txM }}>
                    {editMode
                      ? <Wrapper width={50}><BlurInput val={marker.unit} onSave={(value) => onSaveMarkerField(markerIndex, "unit", value)} /></Wrapper>
                      : <Ed readOnly={readOnly} value={marker.unit || ""} editKey={`amu-${categoryIndex}-${markerIndex}`} onSave={(value) => onSaveMarkerField(markerIndex, "unit", value)} />}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, color: $.txM }}>
                    {editMode ? (
                      <Wrapper dir="row" gap={2} align="center">
                        <Wrapper width={45}><BlurInput val={marker.refMin} onSave={(value) => onSaveMarkerField(markerIndex, "refMin", isNaN(+value) ? 0 : +value)} /></Wrapper>
                        –
                        <Wrapper width={45}><BlurInput val={marker.refMax} onSave={(value) => onSaveMarkerField(markerIndex, "refMax", isNaN(+value) ? 0 : +value)} /></Wrapper>
                      </Wrapper>
                    ) : (
                      <span>
                        <Ed readOnly={readOnly} value={String(marker.refMin)} editKey={`amrn-${categoryIndex}-${markerIndex}`} onSave={(value) => onSaveMarkerField(markerIndex, "refMin", isNaN(+value) ? 0 : +value)} />
                        –
                        <Ed readOnly={readOnly} value={String(marker.refMax)} editKey={`amrx-${categoryIndex}-${markerIndex}`} onSave={(value) => onSaveMarkerField(markerIndex, "refMax", isNaN(+value) ? 0 : +value)} />
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, color: $.ac, fontWeight: 600 }}>
                    {editMode
                      ? <BlurInput val={marker.optimal} tone="accent" bold onSave={(value) => onSaveMarkerField(markerIndex, "optimal", value)} />
                      : <Ed readOnly={readOnly} value={marker.optimal} editKey={`amo-${categoryIndex}-${markerIndex}`} onSave={(value) => onSaveMarkerField(markerIndex, "optimal", value)} />}
                  </td>
                  {dates.map((date) => {
                    const valueObject = marker.values.find(value => value.date === date);
                    const value = valueObject?.value;
                    const numericValue = value != null && value !== "" ? +value : null;
                    const status = valueObject && !valueObject.flagOff && numericValue !== null ? getMarkerStatus(marker, numericValue) : "none";
                    const cellStyle = status !== "none" && status !== "ok" ? statusStyle(status) : {};
                    if (editMode) {
                      return (
                        <td key={date} style={{ padding: "4px 4px", ...cellStyle, borderRadius: 3 }}>
                          <BlurInput
                            val={valueObject ? value : ""}
                            tone={status === "hi" ? "danger" : status === "lo" ? "info" : status === "bd" ? "warning" : "default"}
                            bold={status !== "none" && status !== "ok"}
                            onSave={(nextValue) => onSaveMarkerValue(markerIndex, date, nextValue)}
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={date} style={{ padding: "6px 8px", textAlign: "center", borderRadius: 3, ...cellStyle, cursor: canMutate ? "pointer" : "default" }} onClick={() => { if (canMutate && valueObject) onToggleValueFlag(markerIndex, date); }}>
                        {value != null && value !== "" ? (
                          <Ed readOnly={readOnly} value={String(value)} editKey={`amv-${categoryIndex}-${markerIndex}-${date}`} onSave={(nextValue) => onSaveMarkerValue(markerIndex, date, nextValue)} />
                        ) : (
                          canMutate
                            ? <span style={{ cursor: "pointer", color: $.ac, fontWeight: 600 }} onClick={(event) => { event.stopPropagation(); onCreateValue(markerIndex, date); }}>+</span>
                            : <span style={{ color: $.txM }}>—</span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: "6px 4px" }}>
                    {canMutate && <Button variant="bare" tone="danger" size="xs" onClick={() => onRemoveMarker(markerIndex)}>✕</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canMutate && (
        <Wrapper dir="row" gap={6} marginTop={8}>
          <Button variant="ghost" size="sm" onClick={onAddMarker}>+ Маркер</Button>
          <Button variant="ghost" size="sm" tone="info" onClick={onOpenDatePicker}>+ Дата</Button>
        </Wrapper>
      )}
    </>
  );
}

function AnalyticsCategoryCard({
  category,
  categoryIndex,
  dates,
  collapsed,
  editMode,
  canMutate,
  readOnly,
  analyticsJump,
  dragSource,
  dropTarget,
  dropPosition,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  onToggleCollapsed,
  onRenameCategory,
  onRemoveCategory,
  onRenameDate,
  onDeleteDate,
  onOpenDatePicker,
  onRenameMarker,
  onSaveMarkerField,
  onSaveMarkerValue,
  onToggleValueFlag,
  onCreateValue,
  onRemoveMarker,
  onAddMarker,
}) {
  const { $ } = useTheme();

  return (
    <div
      onDragOver={(event) => onDragOver(event, categoryIndex)}
      onDrop={(event) => onDrop(event, categoryIndex)}
      style={{
        marginBottom: 14,
        width: "100%",
        position: "relative",
        opacity: dragSource ? 0.65 : 1,
        boxShadow: dropTarget ? `0 0 0 1px ${$.ac} inset` : "none",
        transition: "box-shadow .12s ease, opacity .12s ease",
      }}
    >
      <Card size="none" clip>
        {dropTarget && <AnalyticsDropLine position={dropPosition} />}
        <AnalyticsCategoryHeader
          category={category}
          categoryIndex={categoryIndex}
          collapsed={collapsed}
          editMode={editMode}
          canMutate={canMutate}
          markerCount={category.markers?.length || 0}
          onToggleCollapsed={onToggleCollapsed}
          onRenameCategory={onRenameCategory}
          onRemoveCategory={onRemoveCategory}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
        {!collapsed && (
          <AnalyticsTable
            category={category}
            categoryIndex={categoryIndex}
            dates={dates}
            editMode={editMode}
            canMutate={canMutate}
            readOnly={readOnly}
            analyticsJump={analyticsJump}
            onRenameDate={onRenameDate}
            onDeleteDate={onDeleteDate}
            onOpenDatePicker={onOpenDatePicker}
            onRenameMarker={onRenameMarker}
            onSaveMarkerField={onSaveMarkerField}
            onSaveMarkerValue={onSaveMarkerValue}
            onToggleValueFlag={onToggleValueFlag}
            onCreateValue={onCreateValue}
            onRemoveMarker={onRemoveMarker}
            onAddMarker={onAddMarker}
          />
        )}
      </Card>
    </div>
  );
}

export default function AnalyticsPanel({
  categories,
  dates,
  editMode,
  canMutate,
  readOnly,
  canImportData,
  analyticsJump,
  tableScrollRef,
  dateInputRef,
  collapsedCategories,
  dragIndex,
  dragOver,
  getCollapseKey,
  onToggleEdit,
  onDateInputChange,
  onScrollTable,
  onToggleCategoryCollapsed,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onRenameCategory,
  onRemoveCategory,
  onRenameDate,
  onDeleteDate,
  onOpenDatePicker,
  onRenameMarker,
  onSaveMarkerField,
  onSaveMarkerValue,
  onToggleValueFlag,
  onCreateValue,
  onRemoveMarker,
  onAddMarker,
  onAddCategory,
  onAddTemplateGroup,
  onImportFile,
}) {
  const { $ } = useTheme();

  return (
    <div>
      <AnalyticsHiddenDateInput inputRef={dateInputRef} onChangeDate={onDateInputChange} />
      <AnalyticsToolbar
        canMutate={canMutate}
        editMode={editMode}
        canImportData={canImportData}
        readOnly={readOnly}
        onToggleEdit={onToggleEdit}
        onImportFile={onImportFile}
      />
      <div ref={tableScrollRef} onScroll={onScrollTable} style={{ width: "100%", maxWidth: "100%", overflowX: "scroll", overflowY: "hidden", display: "block", WebkitOverflowScrolling: "touch", touchAction: "pan-x", paddingBottom: 6 }}>
        <div style={{ width: "max-content", minWidth: "100%" }}>
          {categories.map((category, categoryIndex) => {
            const collapseKey = getCollapseKey(category, categoryIndex);
            const collapsed = !!collapsedCategories[collapseKey];
            const dropTarget = dragIndex !== null && dragOver?.index === categoryIndex && dragIndex !== categoryIndex;
            return (
              <AnalyticsCategoryCard
                key={categoryIndex}
                category={category}
                categoryIndex={categoryIndex}
                dates={dates}
                collapsed={collapsed}
                editMode={editMode}
                canMutate={canMutate}
                readOnly={readOnly}
                analyticsJump={analyticsJump}
                dragSource={dragIndex === categoryIndex}
                dropTarget={dropTarget}
                dropPosition={dropTarget ? dragOver?.position : "before"}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onToggleCollapsed={() => onToggleCategoryCollapsed(category, categoryIndex)}
                onRenameCategory={(value) => onRenameCategory(categoryIndex, value)}
                onRemoveCategory={() => onRemoveCategory(categoryIndex)}
                onRenameDate={onRenameDate}
                onDeleteDate={onDeleteDate}
                onOpenDatePicker={onOpenDatePicker}
                onRenameMarker={(markerIndex, value) => onRenameMarker(categoryIndex, markerIndex, value)}
                onSaveMarkerField={(markerIndex, field, value) => onSaveMarkerField(categoryIndex, markerIndex, field, value)}
                onSaveMarkerValue={(markerIndex, date, value) => onSaveMarkerValue(categoryIndex, markerIndex, date, value)}
                onToggleValueFlag={(markerIndex, date) => onToggleValueFlag(categoryIndex, markerIndex, date)}
                onCreateValue={(markerIndex, date) => onCreateValue(categoryIndex, markerIndex, date)}
                onRemoveMarker={(markerIndex) => onRemoveMarker(categoryIndex, markerIndex)}
                onAddMarker={() => onAddMarker(categoryIndex)}
              />
            );
          })}
        </div>
      </div>
      {canMutate && <Button variant="ghost" onClick={onAddCategory}>+ Категория анализов</Button>}
      {canMutate && (
        <Wrapper marginTop={10}>
          <div style={{ fontSize: 11, color: $.txM, marginBottom: 6 }}>Быстро добавить группу анализов:</div>
          <Wrapper dir="row" gap={6} wrap>
            {ANALYTICS_GROUP_TEMPLATES.map((template) => (
              <Button key={template.name} variant="ghost" size="sm" tone="accent" onClick={() => onAddTemplateGroup(template)}>
                + {template.name}
              </Button>
            ))}
          </Wrapper>
        </Wrapper>
      )}
    </div>
  );
}
