export default function InjectionsSection({
  injEditDraft,
  setInjEditDraft,
  injCalMonth,
  setInjCalMonth,
  st,
  uS,
  cl,
  $,
  bt,
  card,
}) {
  const editDraft = injEditDraft;
  const setEditDraft = setInjEditDraft;
  const calMonth = injCalMonth;
  const setCalMonth = setInjCalMonth;
  const sch = st.injectionSchedule || { startDate: "", phases: [] };
  const fmtIso = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
  const parseD = iso => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const shiftAll = delta => {
    uS(s => {
      if (!s.injectionSchedule) return;
      s.injectionSchedule.phases = (s.injectionSchedule.phases || []).map(ph => {
        const d = parseD(ph.startDate);
        if (!d) return ph;
        d.setDate(d.getDate() + delta);
        return { ...ph, startDate: fmtIso(d) };
      });
    });
  };
  const genEvents = () => {
    if (!sch.phases?.length) return [];
    const evs = [];
    for (const ph of sch.phases) {
      const phStart = parseD(ph.startDate);
      if (!phStart) continue;
      for (let day = 0; day < (ph.durationDays || 1); day++) {
        const d = new Date(phStart.getFullYear(), phStart.getMonth(), phStart.getDate() + day);
        let ok = false;
        if (ph.type === "daily") ok = true;
        else if (ph.type === "weekdays") ok = (ph.daysOfWeek || []).includes(d.getDay());
        else if (ph.type === "interval") ok = (day % (ph.intervalDays || 1) === 0);
        if (ok) evs.push({ dateIso: fmtIso(d), drug: ph.drug || "?", dosage: ph.dosage || "", instruction: ph.instruction || "", times: ph.times || ["09:00"] });
      }
    }
    return evs;
  };
  const events = genEvents();
  const evByDate = events.reduce((acc, ev) => { (acc[ev.dateIso] = acc[ev.dateIso] || []).push(ev); return acc; }, {});
  const exportIcs = () => {
    if (!events.length) return;
    const p2 = n => String(n).padStart(2, "0");
    const toDt = (iso, t) => { const [y, mo, d] = iso.split("-"); const [h, mi] = (t || "09:00").split(":"); return `${y}${mo}${d}T${p2(h)}${p2(mi)}00`; };
    const esc = s => String(s || "").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    let ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//2life//Injections//RU\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n`;
    let uid = 0;
    for (const ev of events) { for (const t of ev.times) { const dt = toDt(ev.dateIso, t); ics += `BEGIN:VEVENT\r\nUID:inj-${++uid}@2life\r\nDTSTAMP:${toDt(fmtIso(new Date()), "00:00")}\r\nDTSTART:${dt}\r\nDTEND:${dt}\r\nSUMMARY:Инъекция: ${esc(ev.drug)}${ev.dosage ? " " + esc(ev.dosage) : ""}\r\n${ev.instruction ? "DESCRIPTION:" + esc(ev.instruction) + "\r\n" : ""}END:VEVENT\r\n`; } }
    ics += "END:VCALENDAR";
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `injections-${(cl.shortName || cl.name).replace(/\s+/g, "-")}.ics`; a.click(); URL.revokeObjectURL(url);
  };
  const todayIso = fmtIso(new Date());
  const DOW = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const TYPE_LABELS = { daily: "Каждый день", weekdays: "По дням недели", interval: "Каждые N дней" };
  const firstOfMonth = new Date(calMonth.y, calMonth.m, 1);
  const dow0 = firstOfMonth.getDay();
  const daysToSub = dow0 === 0 ? 6 : dow0 - 1;
  const calStart = new Date(calMonth.y, calMonth.m, 1 - daysToSub);
  const calWeeks = [];
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let dw = 0; dw < 7; dw++) week.push(new Date(calStart.getFullYear(), calStart.getMonth(), calStart.getDate() + w * 7 + dw));
    calWeeks.push(week);
    if (w >= 4 && week[6].getMonth() !== calMonth.m) break;
  }
  const inpS = { padding: "5px 8px", border: `1px solid ${$.brd}`, borderRadius: 4, background: $.bgI, color: $.tx, fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  const savePhase = () => {
    const { _idx, ...ph } = editDraft;
    uS(s => { if (!s.injectionSchedule) s.injectionSchedule = { startDate: "", phases: [] }; if (_idx === -1) s.injectionSchedule.phases.push(ph); else s.injectionSchedule.phases[_idx] = ph; });
    setEditDraft(null);
  };

  return (
    <div>
      <div style={card()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>💉 График инъекций</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: $.txS }}>Сдвинуть все фазы:</span>
            <button onClick={() => shiftAll(-1)} title="−1 день" style={{ ...bt("g"), padding: "4px 11px", fontSize: 14, lineHeight: 1 }}>◀</button>
            <button onClick={() => shiftAll(1)} title="+1 день" style={{ ...bt("g"), padding: "4px 11px", fontSize: 14, lineHeight: 1 }}>▶</button>
            <button onClick={exportIcs} disabled={!events.length} style={{ ...bt("g"), fontSize: 11, padding: "4px 12px", color: events.length ? $.ac : $.txM, borderColor: events.length ? $.ac : $.brd, opacity: events.length ? 1 : 0.5 }}>↓ Экспорт .ics</button>
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: $.txS, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>Фазы курса</div>
          {(!sch.phases || !sch.phases.length) && <div style={{ fontSize: 13, color: $.txM, padding: "10px 0" }}>Фазы не добавлены. Нажмите «+ Добавить фазу»</div>}
          {(sch.phases || []).map((ph, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 7, border: `1px solid ${$.brd}`, marginBottom: 6, background: $.bgI }}>
              <div style={{ width: 26, height: 26, borderRadius: 5, background: $.acD, color: $.ac, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{ph.drug || "—"}{ph.dosage && <span style={{ fontWeight: 400, color: $.txS, fontSize: 12 }}> {ph.dosage}</span>}</div>
                <div style={{ fontSize: 11, color: $.txS, marginTop: 2 }}>
                  {ph.startDate && <span style={{ color: $.ac, marginRight: 8, fontWeight: 600 }}>{ph.startDate.split("-").reverse().join(".")}</span>}
                  {TYPE_LABELS[ph.type] || ph.type}
                  {ph.type === "weekdays" && " (" + (ph.daysOfWeek || []).map(d => DOW[d]).join(", ") + ")"}
                  {ph.type === "interval" && ` (каждые ${ph.intervalDays || 2} дн.)`}
                  {" · "}<b>{ph.durationDays || 0}</b> дн. · {(ph.times || ["09:00"]).join(", ")}
                </div>
                {ph.instruction && <div style={{ fontSize: 11, color: $.txM, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ph.instruction}</div>}
              </div>
              <div style={{ display: "flex", gap: 3, flexShrink: 0, marginTop: 1 }}>
                <button onClick={() => uS(s => { const a = s.injectionSchedule.phases; if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; })} disabled={i === 0} style={{ ...bt("g"), padding: "2px 7px", fontSize: 11, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                <button onClick={() => uS(s => { const a = s.injectionSchedule.phases; if (i < a.length - 1) [a[i], a[i + 1]] = [a[i + 1], a[i]]; })} disabled={i === (sch.phases || []).length - 1} style={{ ...bt("g"), padding: "2px 7px", fontSize: 11, opacity: i === (sch.phases || []).length - 1 ? 0.3 : 1 }}>↓</button>
                <button onClick={() => setEditDraft({ _idx: i, ...ph })} style={{ ...bt("g"), padding: "2px 8px", fontSize: 11 }}>✎</button>
                <button onClick={() => uS(s => { s.injectionSchedule.phases.splice(i, 1); })} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 15, padding: "2px 5px", lineHeight: 1 }}>✕</button>
              </div>
            </div>
          ))}
          <button onClick={() => setEditDraft({ _idx: -1, type: "daily", durationDays: 10, startDate: fmtIso(new Date()), times: ["09:00"], daysOfWeek: [1, 3, 5], intervalDays: 2, drug: "", dosage: "", instruction: "" })} style={{ ...bt("g"), fontSize: 12, marginTop: 4, color: $.ac, borderColor: $.ac }}>+ Добавить фазу</button>
        </div>
        {(sch.phases || []).some(ph => ph.startDate) && (
          <div style={{ paddingTop: 16, borderTop: `1px solid ${$.brd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })} style={{ ...bt("g"), padding: "3px 11px", fontSize: 15 }}>‹</button>
              <span style={{ fontWeight: 700, fontSize: 14, minWidth: 170, textAlign: "center" }}>{MONTH_NAMES[calMonth.m]} {calMonth.y}</span>
              <button onClick={() => setCalMonth(p => { const d = new Date(p.y, p.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })} style={{ ...bt("g"), padding: "3px 11px", fontSize: 15 }}>›</button>
              <span style={{ marginLeft: "auto", fontSize: 11, color: $.txS }}>{events.length} инъекц. всего</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
              {DAY_NAMES.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: $.txS, padding: "3px 0" }}>{d}</div>)}
              {calWeeks.flat().map((d, i) => {
                const iso = fmtIso(d);
                const evs = evByDate[iso] || [];
                const curMon = d.getMonth() === calMonth.m;
                const isToday = iso === todayIso;
                return (
                  <div key={i} style={{ minHeight: 56, border: `1px solid ${isToday ? $.ac : $.brd}`, borderRadius: 5, padding: "3px 4px", opacity: curMon ? 1 : 0.22, background: isToday ? $.acD : $.bgI }}>
                    <div style={{ fontSize: 10, fontWeight: isToday ? 700 : 400, color: isToday ? $.ac : $.txM, marginBottom: 2 }}>{d.getDate()}</div>
                    {evs.map((ev, j) => (
                      <div key={j} title={`${ev.drug}${ev.dosage ? " " + ev.dosage : ""}\n${ev.instruction}\nВремя: ${(ev.times || []).join(", ")}`} style={{ fontSize: 9, background: $.acD, color: $.ac, borderRadius: 3, padding: "1px 4px", marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: "14px", cursor: "default" }}>
                        {ev.drug}{ev.dosage ? " " + ev.dosage : ""}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {editDraft && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) setEditDraft(null); }}>
          <div style={{ background: $.bg, border: `1px solid ${$.brd}`, borderRadius: 12, padding: 26, width: 490, maxHeight: "88vh", overflowY: "auto", boxShadow: $.sh }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 18 }}>{editDraft._idx === -1 ? "Новая фаза" : "Редактировать фазу"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><div style={{ fontSize: 11, color: $.txS, marginBottom: 5 }}>Препарат</div><input value={editDraft.drug || ""} onChange={e => { const v = e.target.value; setEditDraft(p => ({ ...p, drug: v })); }} placeholder="Название препарата" style={{ ...inpS, width: "100%" }} /></div>
              <div><div style={{ fontSize: 11, color: $.txS, marginBottom: 5 }}>Дозировка</div><input value={editDraft.dosage || ""} onChange={e => { const v = e.target.value; setEditDraft(p => ({ ...p, dosage: v })); }} placeholder="250mcg" style={{ ...inpS, width: "100%" }} /></div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: $.txS, marginBottom: 5 }}>Инструкция / примечание</div>
              <textarea value={editDraft.instruction || ""} onChange={e => { const v = e.target.value; setEditDraft(p => ({ ...p, instruction: v })); }} rows={2} placeholder="Подкожно, область живота..." style={{ ...inpS, width: "100%", resize: "vertical" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: $.txS, marginBottom: 8 }}>Периодичность</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[["daily", "Каждый день"], ["weekdays", "По дням недели"], ["interval", "Каждые N дней"]].map(([v, l]) => (
                  <button key={v} onClick={() => setEditDraft(p => ({ ...p, type: v }))} style={{ ...bt("g"), padding: "5px 14px", fontSize: 12, ...(editDraft.type === v ? { background: $.acD, color: $.ac, borderColor: $.ac } : {}) }}>{l}</button>
                ))}
              </div>
              {editDraft.type === "weekdays" && (
                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                  {DOW.map((dl, di) => (
                    <button key={di} onClick={() => setEditDraft(p => { const dw = p.daysOfWeek || []; return { ...p, daysOfWeek: dw.includes(di) ? dw.filter(x => x !== di) : [...dw, di] }; })} style={{ ...bt("g"), width: 36, height: 36, padding: 0, fontSize: 12, borderRadius: "50%", ...((editDraft.daysOfWeek || []).includes(di) ? { background: $.acD, color: $.ac, borderColor: $.ac } : {}) }}>{dl}</button>
                  ))}
                </div>
              )}
              {editDraft.type === "interval" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                  <span style={{ fontSize: 12, color: $.txS }}>Каждые</span>
                  <input type="number" min={1} max={90} value={editDraft.intervalDays || 2} onChange={e => setEditDraft(p => ({ ...p, intervalDays: parseInt(e.target.value) || 1 }))} style={{ ...inpS, width: 64, textAlign: "center" }} />
                  <span style={{ fontSize: 12, color: $.txS }}>дней</span>
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 22 }}>
              <div><div style={{ fontSize: 11, color: $.txS, marginBottom: 5 }}>Дата начала</div><input type="date" value={editDraft.startDate || ""} onChange={e => setEditDraft(p => ({ ...p, startDate: e.target.value }))} style={{ ...inpS, width: "100%" }} /></div>
              <div><div style={{ fontSize: 11, color: $.txS, marginBottom: 5 }}>Длительность (дней)</div><input type="number" min={1} max={365} value={editDraft.durationDays || 1} onChange={e => setEditDraft(p => ({ ...p, durationDays: parseInt(e.target.value) || 1 }))} style={{ ...inpS, width: "100%", textAlign: "center" }} /></div>
              <div><div style={{ fontSize: 11, color: $.txS, marginBottom: 5 }}>Время инъекции</div><input type="time" value={(editDraft.times || ["09:00"])[0] || "09:00"} onChange={e => setEditDraft(p => ({ ...p, times: [e.target.value] }))} style={{ ...inpS, width: "100%" }} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setEditDraft(null)} style={{ ...bt("g"), fontSize: 13 }}>Отмена</button>
              <button onClick={savePhase} style={{ ...bt("g"), fontSize: 13, color: $.ac, borderColor: $.ac, fontWeight: 700 }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
