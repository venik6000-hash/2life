import { useEffect } from "react";
import { PROTOCOL_SLOTS, normalizeProtocolText, inferProtocolSlot, createProtocolItem } from "../data/protocolData";
import Ed from "../components/Ed";
import { useEditor } from "../context/EditorContext";

export default function ProtocolSection({
  st,
  pri,
  setPri,
  card,
  $, 
  dk,
  bt,
  bs,
  uS,
  protMode,
  setProtMode,
  todayLabel,
  readOnly = false,
}) {
  const { setEf, setEv } = useEditor();
  const mode = readOnly ? "client" : protMode;
  const rs = st.protocolRevisions || [];
  const activeRevIndex = rs[pri] ? pri : 0;
  const rv = rs[activeRevIndex] || rs[0];
  if (!rv) return <div style={card()}>Пусто</div>;

  const CUSTOM_COLORS = ["#a06ee8", "#e8906e", "#2db8a0", "#c87dd4", "#e8c96e"];
  const customSlots = (rv.customSlots || []).map(s => ({ ...s, _custom: true }));
  const allSlots = [...PROTOCOL_SLOTS, ...customSlots];

  const groups = rv.groups || [];
  let fb = 0;
  const records = [];
  groups.forEach((g, gi) => {
    (g.items || []).forEach((it, ii) => {
      const raw = String(it.slot || "").trim();
      const slotId = (raw && allSlots.find(s => s.id === raw)) ? raw : inferProtocolSlot(it, g.name);
      records.push({ gi, ii, groupName: g.name || "", item: it, slotId, sortOrder: Number.isFinite(+it.order) ? +it.order : 1000 + fb++ });
    });
  });

  const slotBuckets = allSlots.map(slot => ({
    ...slot,
    records: records.filter(r => r.slotId === slot.id).sort((a, b) => a.sortOrder - b.sortOrder || a.gi - b.gi || a.ii - b.ii)
  }));

  const withRevision = (fn) => uS(s => {
    const revisions = s.protocolRevisions || [];
    const rev = revisions[activeRevIndex] || revisions[0];
    if (!rev) return;
    if (!rev.groups) rev.groups = [];
    fn(rev);
  });

  const nextOrderForSlot = (rev, slotId) => {
    let max = -1;
    (rev.groups || []).forEach(g => {
      (g.items || []).forEach((item, idx) => {
        const raw = String(item.slot || "").trim();
        const sid = (raw && [...PROTOCOL_SLOTS, ...(rev.customSlots || [])].find(s => s.id === raw)) ? raw : inferProtocolSlot(item, g.name);
        if (sid !== slotId) return;
        const o = Number.isFinite(+item.order) ? +item.order : 1000 + idx;
        if (o > max) max = o;
      });
    });
    return max + 1;
  };

  const addProtocolItem = (slotId) => {
    const slotDef = allSlots.find(s => s.id === slotId);
    const slotLabel = slotDef?.label || slotId;
    let focusKey = null;
    withRevision(rev => {
      let gi = rev.groups.findIndex(g => normalizeProtocolText(g.name) === normalizeProtocolText(slotLabel));
      if (gi === -1) { rev.groups.push({ name: slotLabel, items: [] }); gi = rev.groups.length - 1; }
      if (!rev.groups[gi].items) rev.groups[gi].items = [];
      const ii = rev.groups[gi].items.length;
      rev.groups[gi].items.push(createProtocolItem(slotId, nextOrderForSlot(rev, slotId)));
      focusKey = `prot-name-${activeRevIndex}-${gi}-${ii}`;
    });
    setProtMode("builder");
    if (focusKey) { setEf(focusKey); setEv("Новый препарат"); }
  };

  const updateProtocolItem = (gi, ii, fn) => withRevision(rev => {
    const item = rev.groups?.[gi]?.items?.[ii];
    if (!item) return;
    fn(item, rev.groups[gi], rev);
  });

  const moveProtocolOrder = (record, direction) => {
    const bucket = slotBuckets.find(s => s.id === record.slotId)?.records || [];
    const index = bucket.findIndex(x => x.gi === record.gi && x.ii === record.ii);
    const swapWith = bucket[index + direction];
    if (index === -1 || !swapWith) return;
    withRevision(rev => {
      const cur = rev.groups?.[record.gi]?.items?.[record.ii];
      const nxt = rev.groups?.[swapWith.gi]?.items?.[swapWith.ii];
      if (!cur || !nxt) return;
      const co = Number.isFinite(+cur.order) ? +cur.order : record.sortOrder;
      const no = Number.isFinite(+nxt.order) ? +nxt.order : swapWith.sortOrder;
      cur.order = no; nxt.order = co;
    });
  };

  const duplicateProtocolItem = (record) => {
    let focusKey = null;
    withRevision(rev => {
      const source = rev.groups?.[record.gi]?.items?.[record.ii];
      if (!source) return;
      const copy = JSON.parse(JSON.stringify(source));
      copy.order = nextOrderForSlot(rev, record.slotId);
      const gi = record.gi;
      const ii = rev.groups[gi].items.length;
      rev.groups[gi].items.push(copy);
      focusKey = `prot-name-${activeRevIndex}-${gi}-${ii}`;
    });
    if (focusKey) { setEf(focusKey); setEv(record.item.name || "Копия"); }
  };

  const removeProtocolItem = (record) => {
    if (!confirm(`Удалить «${record.item.name || "Без названия"}»?`)) return;
    withRevision(rev => { rev.groups?.[record.gi]?.items?.splice(record.ii, 1); });
  };

  const addCustomSlot = () => {
    const name = prompt("Название слота (например: Во время еды, Натощак):");
    if (!name || !name.trim()) return;
    const colorIndex = (rv.customSlots || []).length % CUSTOM_COLORS.length;
    withRevision(rev => {
      if (!rev.customSlots) rev.customSlots = [];
      rev.customSlots.push({ id: `custom-${Date.now()}`, label: name.trim(), rail: CUSTOM_COLORS[colorIndex] });
    });
  };

  const removeCustomSlot = (slotId) => {
    const bucket = slotBuckets.find(s => s.id === slotId);
    const cnt = bucket?.records.length || 0;
    if (cnt > 0 && !confirm(`Слот содержит ${cnt} препаратов. Удалить? Препараты перейдут в «Утро».`)) return;
    withRevision(rev => {
      if (cnt > 0) {
        (slotBuckets.find(s => s.id === slotId)?.records || []).forEach(r => {
          const item = rev.groups?.[r.gi]?.items?.[r.ii];
          if (item) item.slot = "morning";
        });
      }
      rev.customSlots = (rev.customSlots || []).filter(s => s.id !== slotId);
    });
  };

  const saveRevisionField = (key, value) => withRevision(rev => { rev[key] = value; });

  const Field = ({ value, editKey, save, ml, style }) =>
    mode === "builder"
      ? <div style={style}><Ed v={value == null ? "" : String(value)} f={editKey} ml={ml} save={save} /></div>
      : <div style={{ ...style, color: value ? $.tx : $.txM, fontStyle: value ? "normal" : "italic" }}>{value || "—"}</div>;

  const pSurf = dk ? "#0f141d" : "#fffdfa";
  const pAlt = dk ? "rgba(255,255,255,.02)" : "rgba(15,23,42,.025)";
  const slotHd = (rail) => dk ? `${rail}1a` : `${rail}12`;
  const pill = (active, tone = $.ac) => ({ padding: "5px 10px", borderRadius: 999, border: `1px solid ${active ? tone : $.brd}`, background: active ? `${tone}22` : $.bgI, color: active ? tone : $.txS, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit" });
  const clientNotes = rv.clientNotes || "";
  const sheetTitle = rv.sheetTitle || "Схема приема добавок";
  const totalCount = records.length;

  useEffect(() => {
    if (readOnly && protMode !== "client") setProtMode("client");
  }, [readOnly, protMode, setProtMode]);

  return (
    <div>
      <div style={{ ...card({ padding: "12px 16px", marginBottom: 12 }), display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: $.txM, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginRight: 2 }}>Версия</span>
          {rs.map((r, ri) => (
            <span key={ri} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <button onClick={() => setPri(ri)} style={pill(ri === activeRevIndex, $.ac)}>{r.label}{r.date ? ` (${r.date})` : ""}</button>
              {rs.length > 1 && mode === "builder" && <button onClick={() => { if (confirm(`Удалить версию «${r.label}»?`)) { uS(s => { s.protocolRevisions.splice(ri, 1); }); setPri(p => p >= ri && p > 0 ? p - 1 : p); } }} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 11, padding: "2px 3px" }}>✕</button>}
            </span>
          ))}
          {mode === "builder" && <button onClick={() => { const now = new Date(); const d = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`; const cp = JSON.parse(JSON.stringify(rv)); cp.id = rs.length + 1; cp.date = d; cp.label = `Корректировка ${rs.length + 1}`; uS(s => { s.protocolRevisions.push(cp); }); setPri(rs.length); }} style={pill(false, $.ac)}>+ Корректировка</button>}
        </div>
        {!readOnly && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setProtMode("builder")} style={pill(mode === "builder", $.ac)}>Редактировать</button>
          <button onClick={() => setProtMode("client")} style={pill(mode === "client", $.in)}>Вид клиента</button>
        </div>}
      </div>

      <div style={{ ...card({ padding: 0, overflow: "hidden" }), background: pSurf, borderColor: $.brd }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${$.brd}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, background: $.ac, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800 }}>2</div>
            <span style={{ fontWeight: 800, fontSize: 15, color: $.tx }}>2life</span>
          </div>
          <div style={{ flex: 1, minWidth: 200, textAlign: "center" }}>
            {mode === "builder"
              ? <div style={{ display: "inline-block" }}><Ed v={sheetTitle} f={`prot-title-${activeRevIndex}`} save={v => saveRevisionField("sheetTitle", v || "Схема приема добавок")} /></div>
              : <div style={{ fontSize: 17, fontWeight: 800, color: $.tx }}>{sheetTitle}</div>}
            <div style={{ fontSize: 11, color: $.txM, marginTop: 3 }}>{rv.label || "Стартовый"} · {rv.date || todayLabel()} · {totalCount} препаратов</div>
          </div>
          <div style={{ minWidth: 80 }} />
        </div>

        {allSlots.map((slot) => {
          const bucket = slotBuckets.find(s => s.id === slot.id) || { ...slot, records: [] };
          const isCustom = !!slot._custom;
          return (
            <div key={slot.id} style={{ borderTop: `1px solid ${$.brd}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 20px", background: slotHd(slot.rail) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: slot.rail, flexShrink: 0 }} />
                  {isCustom && mode === "builder"
                    ? <div style={{ fontSize: 13, fontWeight: 800, color: slot.rail, lineHeight: 1.2 }}><Ed v={slot.label} f={`prot-slotname-${slot.id}`} save={v => withRevision(rev => { const cs = (rev.customSlots || []).find(x => x.id === slot.id); if (cs) cs.label = v || "Слот"; })} /></div>
                    : <span style={{ fontSize: 13, fontWeight: 800, color: slot.rail }}>{slot.label}</span>}
                  <span style={{ fontSize: 11, color: $.txM, fontWeight: 600 }}>{bucket.records.length} поз.</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {mode === "builder" && <button onClick={() => addProtocolItem(slot.id)} style={{ ...pill(false, slot.rail), color: slot.rail, borderColor: `${slot.rail}55` }}>+ Добавить</button>}
                  {isCustom && mode === "builder" && <button onClick={() => removeCustomSlot(slot.id)} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 13, padding: "2px 5px" }}>✕</button>}
                </div>
              </div>
              {bucket.records.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: pAlt }}>
                        {["Препарат", "Доза", "Условия приёма", "Цель", "Курс / Упак.", ...(mode === "builder" ? [""] : [])]
                          .map(h => <th key={h} style={{ padding: "7px 14px", textAlign: "left", fontSize: 11, color: $.txM, fontWeight: 700, borderBottom: `1px solid ${$.brd}`, whiteSpace: "nowrap" }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {bucket.records.map((record, rowIndex) => (
                        <tr key={`${record.gi}-${record.ii}`} style={{ borderBottom: `1px solid ${$.brd}`, background: rowIndex % 2 === 0 ? pSurf : pAlt }}>
                          <td style={{ padding: "11px 14px", verticalAlign: "top", minWidth: 200 }}>
                            {mode === "builder"
                              ? <div style={{ fontWeight: 600, color: $.tx }}><Ed v={record.item.name || ""} f={`prot-name-${activeRevIndex}-${record.gi}-${record.ii}`} save={v => updateProtocolItem(record.gi, record.ii, item => { item.name = v; })} /></div>
                              : <div style={{ fontWeight: 600, color: $.tx }}>{record.item.link ? <a href={record.item.link} target="_blank" rel="noreferrer" style={{ color: $.tx, textDecoration: "none" }}>{record.item.name || "—"}<span style={{ color: $.in, fontSize: 11 }}> ↗</span></a> : (record.item.name || <i style={{ color: $.txM }}>—</i>)}</div>}
                            {mode === "builder" && <div style={{ marginTop: 3 }}><button onClick={() => { const u = prompt("Ссылка на магазин:", record.item.link || ""); if (u !== null) updateProtocolItem(record.gi, record.ii, item => { item.link = u; }); }} style={{ background: "none", border: "none", cursor: "pointer", color: record.item.link ? $.in : $.txM, fontSize: 10, padding: 0, fontFamily: "inherit" }}>{record.item.link ? "🔗 Ссылка" : "+ ссылка"}</button></div>}
                          </td>
                          <td style={{ padding: "11px 14px", verticalAlign: "top", minWidth: 100 }}>
                            <Field value={record.item.dose || ""} editKey={`prot-dose-${activeRevIndex}-${record.gi}-${record.ii}`} save={v => updateProtocolItem(record.gi, record.ii, item => { item.dose = v; })} />
                          </td>
                          <td style={{ padding: "11px 14px", verticalAlign: "top", minWidth: 150, color: $.txS }}>
                            <Field value={record.item.timing || ""} editKey={`prot-time-${activeRevIndex}-${record.gi}-${record.ii}`} save={v => updateProtocolItem(record.gi, record.ii, item => { item.timing = v; })} />
                          </td>
                          <td style={{ padding: "11px 14px", verticalAlign: "top", minWidth: 180, color: $.txS }}>
                            <Field value={record.item.goal || ""} editKey={`prot-goal-${activeRevIndex}-${record.gi}-${record.ii}`} save={v => updateProtocolItem(record.gi, record.ii, item => { item.goal = v; })} />
                          </td>
                          <td style={{ padding: "11px 14px", verticalAlign: "top", minWidth: 110, whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                              <Field value={record.item.days == null ? "" : String(record.item.days)} editKey={`prot-days-${activeRevIndex}-${record.gi}-${record.ii}`} save={v => updateProtocolItem(record.gi, record.ii, item => { item.days = isNaN(+v) ? v : +v; })} style={{ minWidth: 28, textAlign: "center" }} />
                              <span style={{ color: $.txM, fontSize: 11 }}>дн /</span>
                              <Field value={record.item.packs == null ? "" : String(record.item.packs)} editKey={`prot-packs-${activeRevIndex}-${record.gi}-${record.ii}`} save={v => updateProtocolItem(record.gi, record.ii, item => { item.packs = isNaN(+v) ? v : +v; })} style={{ minWidth: 22, textAlign: "center" }} />
                              <span style={{ color: $.txM, fontSize: 11 }}>уп</span>
                            </div>
                          </td>
                          {mode === "builder" && <td style={{ padding: "11px 10px", verticalAlign: "top", width: 100 }}>
                            <div style={{ display: "flex", gap: 3, justifyContent: "flex-end" }}>
                              <button onClick={() => moveProtocolOrder(record, -1)} style={{ ...bs, background: $.bgI, color: $.txS, border: `1px solid ${$.brd}` }}>↑</button>
                              <button onClick={() => moveProtocolOrder(record, 1)} style={{ ...bs, background: $.bgI, color: $.txS, border: `1px solid ${$.brd}` }}>↓</button>
                              <button onClick={() => duplicateProtocolItem(record)} style={{ ...bs, background: $.acD, color: $.ac }}>⧉</button>
                              <button onClick={() => removeProtocolItem(record)} style={{ ...bs, background: $.dnD, color: $.dn }}>✕</button>
                            </div>
                          </td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {bucket.records.length === 0 && <div style={{ padding: "12px 20px", color: $.txM, fontSize: 12, fontStyle: "italic" }}>{mode === "builder" ? "Нажмите «+ Добавить», чтобы добавить препарат" : "Нет назначений"}</div>}
            </div>
          );
        })}

        {mode === "builder" && (
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${$.brd}`, background: pSurf, display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={addCustomSlot} style={pill(false, $.ac)}>+ Добавить слот</button>
            <span style={{ fontSize: 11, color: $.txM }}>Например: «Во время еды», «Натощак», «До тренировки»</span>
          </div>
        )}

        <div style={{ padding: "18px 20px", borderTop: `1px solid ${$.brd}`, background: pSurf }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: $.txM, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Заметки для клиента</div>
          {mode === "builder"
            ? <div style={{ fontSize: 13, lineHeight: 1.7, color: $.tx, fontFamily: "inherit" }}><Ed v={clientNotes} f={`prot-notes-${activeRevIndex}`} ml save={v => saveRevisionField("clientNotes", v)} /></div>
            : (clientNotes
              ? <div style={{ fontSize: 13, lineHeight: 1.7, color: $.tx, fontFamily: "inherit" }}>{clientNotes.split("\n").map((line, idx) => <div key={idx}>{line || <br />}</div>)}</div>
              : <div style={{ color: $.txM, fontStyle: "italic", fontSize: 12, fontFamily: "inherit" }}>Нет заметок</div>)}
        </div>
      </div>
    </div>
  );
}
