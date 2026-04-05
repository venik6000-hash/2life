import { sevColors } from "../styles/theme";
import { getAutoDeficitsFromAnalytics } from "../utils/analyticsUtils";
import Ed from "../components/Ed";
import SexEd from "../components/SexEd";
import Badge from "../components/Badge";

export default function OverviewSection({
  st,
  pri,
  doctors,
  autoBmiValue,
  stageProfile,
  card,
  setMd,
  $,
  cl,
  uC,
  uS,
  bt,
  setSec,
  setAnalyticsJump,
  defPickOpen,
  setDefPickOpen,
  deficitPresets,
  readOnly = false,
}) {
  const pc = st.protocolRevisions?.[pri]?.groups?.reduce((a, g) => a + g.items.length, 0) || 0;
  const autoDef = getAutoDeficitsFromAnalytics(st.analyticsCategories || [], st.autoDeficitSelection || [], deficitPresets || []);
  const shownDef = [...autoDef.primary, ...autoDef.selectedExtras];
  const docOptions = [
    ...doctors.filter(d => d?.name),
    ...(st.doctor && !doctors.find(d => d.name === st.doctor) ? [{ name: st.doctor, role: st.doctorRole || "" }] : []),
  ];
  const bmiNum = autoBmiValue;
  const sexOptions = ["", "Женский", "Мужской"];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
        {[
          { l: "Вес", v: `${stageProfile.weightCurrent || "—"} кг`, s: `Цель: ${stageProfile.weightGoal || "—"}`, c: "ac" },
          { l: "ИМТ", v: stageProfile.bmi || "—", s: Number.isFinite(bmiNum) ? (bmiNum < 25 ? "Норма" : "Избыток") : "—", c: Number.isFinite(bmiNum) ? (bmiNum < 25 ? "ac" : "wr") : "wr" },
          { l: "Синдромы", v: st.syndromes?.length || 0, s: `${st.syndromes?.filter(x => x.severity === "high").length || 0} высоких, ${st.syndromes?.filter(x => x.severity === "medium").length || 0} средних`, c: "dn" },
          { l: "Дефициты", v: autoDef.all.length || 0, s: autoDef.lastDate ? `${autoDef.all.length ? "актуально на " + autoDef.lastDate : "не выявлены на " + autoDef.lastDate}` : "нет анализов", c: "wr" },
          { l: "Протокол", v: pc, s: "препаратов", c: "pu" },
          { l: "Врач", v: st.doctor || "—", s: st.doctorRole || "Нажмите, чтобы выбрать", c: "in", act: !readOnly },
        ].map((k, i) => (
          <div key={i} onClick={k.act ? () => setMd("docAssign") : undefined} style={{ ...card({ padding: 14 }), ...(k.act ? { cursor: "pointer" } : {}), transition: "border-color .15s, transform .15s", borderColor: k.act ? $.in : $.brd }}>
            <div style={{ fontSize: 10, color: $.txM, marginBottom: 3 }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: $[k.c], letterSpacing: -0.5 }}>{k.v}</div>
            <div style={{ fontSize: 11, color: $.txS }}>{k.s}</div>
          </div>
        ))}
      </div>

      <div style={card({ marginBottom: 14 })}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}><span style={{ color: $.ac }}>●</span> Профиль клиента</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8, fontSize: 13 }}>
          {[["Пол", "sex", "client"], ["ДР", "dob", "client"], ["Email", "email", "stage"], ["Тел", "phone", "stage"], ["Город", "city", "stage"], ["Рост", "height", "stage"], ["Вес", "weightCurrent", "stage"], ["Цель", "weightGoal", "stage"], ["Талия", "waist", "stage"]].map(([l, k, scope]) => {
            const value = scope === "client" ? cl[k] : stageProfile[k];
            const isSexField = k === "sex" && scope === "client";
            const fieldKey = `p-${scope}-${k}`;
            return (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${$.brd}`, gap: 10, alignItems: "center" }}>
                <span style={{ color: $.txS }}>{l}</span>
                {isSexField
                  ? (readOnly
                    ? <span style={{ color: cl.sex ? $.tx : $.txM, fontStyle: cl.sex ? "normal" : "italic" }}>{cl.sex || "—"}</span>
                    : <SexEd value={String(cl.sex || "")} f={fieldKey} options={sexOptions} save={nextValue => uC(c => { c.sex = nextValue; return c; })} />)
                  : <Ed ro={readOnly} v={String(value || "")} f={fieldKey} save={v => scope === "client" ? uC(c => { c[k] = (k === "dob" || isNaN(+v)) ? v : +v; return c; }) : uS(s => { const numKeys = ["height", "weightCurrent", "weightGoal", "waist"]; s[k] = numKeys.includes(k) ? (isNaN(+v) || v === "" ? v : +v) : String(v); })} />}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🎯 Задачи</div>
          {st.tasks?.map((t2, i) => <div key={i} style={{ padding: "5px 0", borderBottom: `1px solid ${$.brd}`, fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><span style={{ color: $.ac, fontWeight: 700 }}>{i + 1}.</span><div style={{ flex: 1 }}><Ed ro={readOnly} v={t2} f={`tk-${i}`} save={v => uS(s => { s.tasks[i] = v; })} /></div>{!readOnly && <button onClick={() => uS(s => { s.tasks.splice(i, 1); })} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 12 }}>✕</button>}</div>)}
          {!readOnly && <button onClick={() => uS(s => { (s.tasks || (s.tasks = [])).push("Новая задача"); })} style={{ ...bt("g"), marginTop: 8, fontSize: 11 }}>+ Задача</button>}
        </div>
        <div style={card()}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>⚡ Синдромы</div>
          {st.syndromes?.map((s2, i) => <div key={i} style={{ padding: "5px 0", borderBottom: `1px solid ${$.brd}`, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><div style={{ flex: 1 }}><Ed ro={readOnly} v={s2.name} f={`sy-${i}`} save={v => uS(s => { s.syndromes[i].name = v; })} /></div>{readOnly ? <span style={{ padding: "2px 6px", borderRadius: 5, fontSize: 11, fontWeight: 600, border: `1px solid ${$.brd}`, background: $.bgI, color: $[sevColors[s2.severity]], fontFamily: "inherit" }}>{s2.severity === "high" ? "Высокий" : s2.severity === "low" ? "Низкий" : "Средний"}</span> : <select value={s2.severity} onChange={ev2 => uS(s => { s.syndromes[i].severity = ev2.target.value; })} style={{ padding: "2px 6px", borderRadius: 5, fontSize: 11, fontWeight: 600, border: `1px solid ${$.brd}`, background: $.bgI, color: $[sevColors[s2.severity]], cursor: "pointer", fontFamily: "inherit" }}><option value="high">Высокий</option><option value="medium">Средний</option><option value="low">Низкий</option></select>}{!readOnly && <button onClick={() => uS(s => { s.syndromes.splice(i, 1); })} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 12 }}>✕</button>}</div>)}
          {!readOnly && <button onClick={() => uS(s => { (s.syndromes || (s.syndromes = [])).push({ name: "Новый синдром", severity: "medium" }); })} style={{ ...bt("g"), marginTop: 8, fontSize: 11 }}>+ Синдром</button>}
        </div>
      </div>
      <div style={card({ marginBottom: 14 })}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🩺 Диагнозы</div>
        {st.diagnoses?.map((d2, i) => <div key={i} style={{ padding: "5px 0", borderBottom: `1px solid ${$.brd}`, fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><span style={{ color: $.ac, fontWeight: 700 }}>{i + 1}.</span><div style={{ flex: 1 }}><Ed ro={readOnly} v={d2} f={`dg-${i}`} save={v => uS(s => { s.diagnoses[i] = v; })} /></div>{!readOnly && <button onClick={() => uS(s => { s.diagnoses.splice(i, 1); })} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 12 }}>✕</button>}</div>)}
        {!readOnly && <button onClick={() => uS(s => { (s.diagnoses || (s.diagnoses = [])).push("Новый диагноз"); })} style={{ ...bt("g"), marginTop: 8, fontSize: 11 }}>+ Диагноз</button>}
      </div>
      <div style={card({ marginBottom: 14 })}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🧬 Дефициты</div>
        {!autoDef.lastDate
          ? <div style={{ fontSize: 12, color: $.txM }}>Нет анализов для автоопределения дефицитов</div>
          : !autoDef.all.length
            ? <div style={{ fontSize: 12, color: $.txM }}>По последней дате ({autoDef.lastDate}) явные дефициты не выявлены</div>
            : <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {shownDef.map(d => <button key={d.id} onClick={() => { setSec("analytics"); setAnalyticsJump({ markerName: d.markerName, categoryName: d.categoryName, markerKey: d.markerKey, date: d.date, ts: Date.now() }); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }} title={`Перейти к анализу: ${d.categoryName ? d.categoryName + " • " : ""}${d.markerName} • ${d.date}`}><Badge c={d.status === "lo" ? "dn" : "wr"} ch={d.label} /></button>)}
                {!readOnly && autoDef.hidden.length > 0 && <button onClick={() => setDefPickOpen(v => !v)} style={{ ...bt("g"), padding: "3px 8px", fontSize: 11, color: $.ac, borderColor: $.ac }}>+ ещё {autoDef.hidden.length}</button>}
              </div>
              <div style={{ fontSize: 11, color: $.txM, marginTop: 8 }}>По последним анализам от {autoDef.lastDate}</div>
              {!readOnly && defPickOpen && autoDef.all.length > 4 && <div style={{ marginTop: 10, padding: 10, border: `1px solid ${$.brd}`, borderRadius: 8, background: $.bgI }}><div style={{ fontSize: 11, fontWeight: 700, color: $.txS, marginBottom: 8 }}>Какие дополнительные дефициты показывать в обзоре</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }}>{autoDef.all.slice(4).map(item => { const checked = (st.autoDeficitSelection || []).includes(item.id); return <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}><input type="checkbox" checked={checked} onChange={e => uS(s => { const arr = s.autoDeficitSelection || (s.autoDeficitSelection = []); if (e.target.checked) { if (!arr.includes(item.id)) arr.push(item.id); } else { s.autoDeficitSelection = arr.filter(id => id !== item.id); } })} /><span>{item.label}</span></label>; })}</div></div>}
            </>}
      </div>
    </div>
  );
}
