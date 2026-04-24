import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import Card from "./Card";
import Ed from "./Ed";
import ProtocolField from "./ProtocolField";
import Wrapper from "./Wrapper";

export default function ProtocolSheet({
  allSlots,
  slotBuckets,
  mode,
  rv,
  activeRevIndex,
  todayLabel,
  totalCount,
  onAddItem,
  onRemoveCustomSlot,
  onMoveOrder,
  onDuplicate,
  onRemoveItem,
  onUpdateItem,
  onSaveField,
  onSaveSlotName,
  onAddCustomSlot,
}) {
  const { $, dk } = useTheme();
  const surfaceColor = dk ? "#0f141d" : "#fffdfa";
  const altSurfaceColor = dk ? "rgba(255,255,255,.02)" : "rgba(15,23,42,.025)";
  const slotHeaderBg = (rail) => (dk ? `${rail}1a` : `${rail}12`);

  const sheetTitle = rv.sheetTitle || "Схема приема добавок";
  const clientNotes = rv.clientNotes || "";

  return (
    <Card size="none" clip>
      <div style={{ background: surfaceColor }}>

        {/* Sheet header */}
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${$.brd}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, background: $.ac, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800 }}>2</div>
            <span style={{ fontWeight: 800, fontSize: 15, color: $.tx }}>2life</span>
          </div>
          <div style={{ flex: 1, minWidth: 200, textAlign: "center" }}>
            {mode === "builder"
              ? <div style={{ display: "inline-block" }}><Ed value={sheetTitle} editKey={`prot-title-${activeRevIndex}`} onSave={(v) => onSaveField("sheetTitle", v || "Схема приема добавок")} /></div>
              : <div style={{ fontSize: 17, fontWeight: 800, color: $.tx }}>{sheetTitle}</div>}
            <div style={{ fontSize: 11, color: $.txM, marginTop: 3 }}>
              {rv.label || "Стартовый"} · {rv.date || todayLabel()} · {totalCount} препаратов
            </div>
          </div>
          <div style={{ minWidth: 80 }} />
        </div>

        {/* Slot sections */}
        {allSlots.map((slot) => {
          const bucket = slotBuckets.find((e) => e.id === slot.id) || { ...slot, records: [] };
          const isCustom = !!slot._custom;
          return (
            <div key={slot.id} style={{ borderTop: `1px solid ${$.brd}` }}>
              {/* Slot header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 20px", background: slotHeaderBg(slot.rail) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: slot.rail, flexShrink: 0 }} />
                  {isCustom && mode === "builder"
                    ? <div style={{ fontSize: 13, fontWeight: 800, color: slot.rail, lineHeight: 1.2 }}>
                        <Ed
                          value={slot.label}
                          editKey={`prot-slotname-${slot.id}`}
                          onSave={(v) => onSaveSlotName(slot.id, v)}
                        />
                      </div>
                    : <span style={{ fontSize: 13, fontWeight: 800, color: slot.rail }}>{slot.label}</span>}
                  <span style={{ fontSize: 11, color: $.txM, fontWeight: 600 }}>{bucket.records.length} поз.</span>
                </div>
                <Wrapper dir="row" gap="sm" align="center">
                  {mode === "builder" && <Button variant="soft" tone="accent" size="xs" onClick={() => onAddItem(slot.id)}>+ Добавить</Button>}
                  {isCustom && mode === "builder" && <Button variant="bare" tone="danger" size="xs" onClick={() => onRemoveCustomSlot(slot.id)}>✕</Button>}
                </Wrapper>
              </div>

              {/* Records table */}
              {bucket.records.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: altSurfaceColor }}>
                        {["Препарат", "Доза", "Условия приёма", "Цель", "Курс / Упак.", ...(mode === "builder" ? [""] : [])].map((h) => (
                          <th key={h} style={{ padding: "7px 14px", textAlign: "left", fontSize: 11, color: $.txM, fontWeight: 700, borderBottom: `1px solid ${$.brd}`, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bucket.records.map((record, rowIndex) => (
                        <tr key={`${record.gi}-${record.ii}`} style={{ borderBottom: `1px solid ${$.brd}`, background: rowIndex % 2 === 0 ? surfaceColor : altSurfaceColor }}>
                          <td style={{ padding: "11px 14px", verticalAlign: "top", minWidth: 200 }}>
                            {mode === "builder"
                              ? <div style={{ fontWeight: 600, color: $.tx }}><Ed value={record.item.name || ""} editKey={`prot-name-${activeRevIndex}-${record.gi}-${record.ii}`} onSave={(v) => onUpdateItem(record.gi, record.ii, (item) => { item.name = v; })} /></div>
                              : <div style={{ fontWeight: 600, color: $.tx }}>
                                  {record.item.link
                                    ? <a href={record.item.link} target="_blank" rel="noreferrer" style={{ color: $.tx, textDecoration: "none" }}>
                                        {record.item.name || "—"}<span style={{ color: $.in, fontSize: 11 }}> ↗</span>
                                      </a>
                                    : (record.item.name || <i style={{ color: $.txM }}>—</i>)}
                                </div>}
                            {mode === "builder" && (
                              <div style={{ marginTop: 3 }}>
                                <Button
                                  variant="bare"
                                  tone={record.item.link ? "info" : "neutral"}
                                  size="xs"
                                  onClick={() => {
                                    const nextLink = prompt("Ссылка на магазин:", record.item.link || "");
                                    if (nextLink !== null) onUpdateItem(record.gi, record.ii, (item) => { item.link = nextLink; });
                                  }}
                                >
                                  {record.item.link ? "🔗 Ссылка" : "+ ссылка"}
                                </Button>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "11px 14px", verticalAlign: "top", minWidth: 100 }}>
                            <ProtocolField editable={mode === "builder"} value={record.item.dose || ""} editKey={`prot-dose-${activeRevIndex}-${record.gi}-${record.ii}`} onSave={(v) => onUpdateItem(record.gi, record.ii, (item) => { item.dose = v; })} />
                          </td>
                          <td style={{ padding: "11px 14px", verticalAlign: "top", minWidth: 150, color: $.txS }}>
                            <ProtocolField editable={mode === "builder"} value={record.item.timing || ""} editKey={`prot-time-${activeRevIndex}-${record.gi}-${record.ii}`} onSave={(v) => onUpdateItem(record.gi, record.ii, (item) => { item.timing = v; })} />
                          </td>
                          <td style={{ padding: "11px 14px", verticalAlign: "top", minWidth: 180, color: $.txS }}>
                            <ProtocolField editable={mode === "builder"} value={record.item.goal || ""} editKey={`prot-goal-${activeRevIndex}-${record.gi}-${record.ii}`} onSave={(v) => onUpdateItem(record.gi, record.ii, (item) => { item.goal = v; })} />
                          </td>
                          <td style={{ padding: "11px 14px", verticalAlign: "top", minWidth: 110, whiteSpace: "nowrap" }}>
                            <Wrapper dir="row" gap={3} align="center">
                              <div style={{ minWidth: 36, textAlign: "center" }}>
                                <ProtocolField editable={mode === "builder"} value={record.item.days == null ? "" : String(record.item.days)} editKey={`prot-days-${activeRevIndex}-${record.gi}-${record.ii}`} onSave={(v) => onUpdateItem(record.gi, record.ii, (item) => { item.days = isNaN(+v) ? v : +v; })} />
                              </div>
                              <span style={{ color: $.txM, fontSize: 11 }}>дн /</span>
                              <div style={{ minWidth: 28, textAlign: "center" }}>
                                <ProtocolField editable={mode === "builder"} value={record.item.packs == null ? "" : String(record.item.packs)} editKey={`prot-packs-${activeRevIndex}-${record.gi}-${record.ii}`} onSave={(v) => onUpdateItem(record.gi, record.ii, (item) => { item.packs = isNaN(+v) ? v : +v; })} />
                              </div>
                              <span style={{ color: $.txM, fontSize: 11 }}>уп</span>
                            </Wrapper>
                          </td>
                          {mode === "builder" && (
                            <td style={{ padding: "11px 10px", verticalAlign: "top", width: 100 }}>
                              <Wrapper dir="row" gap={3} justify="flex-end">
                                <Button variant="ghost" size="xs" onClick={() => onMoveOrder(record, -1)}>↑</Button>
                                <Button variant="ghost" size="xs" onClick={() => onMoveOrder(record, 1)}>↓</Button>
                                <Button variant="soft" tone="accent" size="xs" onClick={() => onDuplicate(record)}>⧉</Button>
                                <Button variant="soft" tone="danger" size="xs" onClick={() => onRemoveItem(record)}>✕</Button>
                              </Wrapper>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {bucket.records.length === 0 && (
                <div style={{ padding: "12px 20px", color: $.txM, fontSize: 12, fontStyle: "italic" }}>
                  {mode === "builder" ? "Нажмите «+ Добавить», чтобы добавить препарат" : "Нет назначений"}
                </div>
              )}
            </div>
          );
        })}

        {/* Add custom slot footer */}
        {mode === "builder" && (
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${$.brd}`, background: surfaceColor, display: "flex", alignItems: "center", gap: 10 }}>
            <Button variant="pill" active={false} onClick={onAddCustomSlot}>+ Добавить слот</Button>
            <span style={{ fontSize: 11, color: $.txM }}>Например: «Во время еды», «Натощак», «До тренировки»</span>
          </div>
        )}

        {/* Client notes */}
        <div style={{ padding: "18px 20px", borderTop: `1px solid ${$.brd}`, background: surfaceColor }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: $.txM, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Заметки для клиента</div>
          {mode === "builder"
            ? <div style={{ fontSize: 13, lineHeight: 1.7, color: $.tx, fontFamily: "inherit" }}>
                <Ed value={clientNotes} editKey={`prot-notes-${activeRevIndex}`} multiline onSave={(v) => onSaveField("clientNotes", v)} />
              </div>
            : (clientNotes
                ? <div style={{ fontSize: 13, lineHeight: 1.7, color: $.tx, fontFamily: "inherit" }}>
                    {clientNotes.split("\n").map((line, i) => <div key={i}>{line || <br />}</div>)}
                  </div>
                : <div style={{ color: $.txM, fontStyle: "italic", fontSize: 12, fontFamily: "inherit" }}>Нет заметок</div>)}
        </div>
      </div>
    </Card>
  );
}
