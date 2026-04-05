import { useState } from "react";
import Ed from "../components/Ed";

export default function NutritionSection({ st, nri, setNri, card, $, bt, uS, todayLabel, bs, readOnly = false }) {
  const ensureRevisionShape = (rev) => {
    if (!Array.isArray(rev.generalRules)) rev.generalRules = [];
    if (!Array.isArray(rev.categories)) rev.categories = [];
    if (!Array.isArray(rev.instructions)) rev.instructions = [];
    if (typeof rev.comment !== "string") rev.comment = "";
  };
  const baseNutrition = st.nutrition || { generalRules: [], categories: [], instructions: [] };
  const revisions = Array.isArray(st.nutritionRevisions) && st.nutritionRevisions.length
    ? st.nutritionRevisions
    : [{ id: 1, date: st.dateStart || "", label: "Стартовый", comment: "", generalRules: JSON.parse(JSON.stringify(baseNutrition.generalRules || [])), categories: JSON.parse(JSON.stringify(baseNutrition.categories || [])), instructions: JSON.parse(JSON.stringify(baseNutrition.instructions || [])) }];
  const activeRevisionIndex = revisions[nri] ? nri : 0;
  const n = revisions[activeRevisionIndex];
  if (!n) return <div style={card()}>Не заполнено</div>;

  const withNutritionRevision = (fn) => uS(s => {
    if (!Array.isArray(s.nutritionRevisions) || !s.nutritionRevisions.length) {
      const legacy = s.nutrition || { generalRules: [], categories: [], instructions: [] };
      s.nutritionRevisions = [{ id: 1, date: s.dateStart || "", label: "Стартовый", comment: "", generalRules: JSON.parse(JSON.stringify(legacy.generalRules || [])), categories: JSON.parse(JSON.stringify(legacy.categories || [])), instructions: JSON.parse(JSON.stringify(legacy.instructions || [])) }];
    }
    const idx = s.nutritionRevisions[activeRevisionIndex] ? activeRevisionIndex : 0;
    const rev = s.nutritionRevisions[idx];
    ensureRevisionShape(rev);
    fn(rev, s, idx);
    s.nutrition = {
      generalRules: JSON.parse(JSON.stringify(rev.generalRules)),
      categories: JSON.parse(JSON.stringify(rev.categories)),
      instructions: JSON.parse(JSON.stringify(rev.instructions)),
    };
  });

  const addNutritionRevision = () => {
    let nextIdx = activeRevisionIndex;
    uS(s => {
      if (!Array.isArray(s.nutritionRevisions) || !s.nutritionRevisions.length) {
        const legacy = s.nutrition || { generalRules: [], categories: [], instructions: [] };
        s.nutritionRevisions = [{ id: 1, date: s.dateStart || "", label: "Стартовый", comment: "", generalRules: JSON.parse(JSON.stringify(legacy.generalRules || [])), categories: JSON.parse(JSON.stringify(legacy.categories || [])), instructions: JSON.parse(JSON.stringify(legacy.instructions || [])) }];
      }
      const idx = s.nutritionRevisions[activeRevisionIndex] ? activeRevisionIndex : 0;
      const current = s.nutritionRevisions[idx];
      ensureRevisionShape(current);
      const copy = JSON.parse(JSON.stringify(current));
      copy.id = (s.nutritionRevisions.reduce((mx, it) => Math.max(mx, +it.id || 0), 0) || 0) + 1;
      copy.date = todayLabel();
      copy.label = `Корректировка ${s.nutritionRevisions.length + 1}`;
      copy.comment = "";
      s.nutritionRevisions.push(copy);
      nextIdx = s.nutritionRevisions.length - 1;
      s.nutrition = {
        generalRules: JSON.parse(JSON.stringify(copy.generalRules || [])),
        categories: JSON.parse(JSON.stringify(copy.categories || [])),
        instructions: JSON.parse(JSON.stringify(copy.instructions || [])),
      };
    });
    setNri(nextIdx);
  };

  const removeNutritionRevision = (ri) => {
    if (revisions.length <= 1) return;
    const target = revisions[ri];
    if (!confirm(`Удалить версию питания «${target?.label || `#${ri + 1}` }»?`)) return;
    let nextIdx = activeRevisionIndex;
    uS(s => {
      if (!Array.isArray(s.nutritionRevisions) || s.nutritionRevisions.length <= 1) return;
      s.nutritionRevisions.splice(ri, 1);
      if (nextIdx >= s.nutritionRevisions.length) nextIdx = s.nutritionRevisions.length - 1;
      if (nextIdx < 0) nextIdx = 0;
      const rev = s.nutritionRevisions[nextIdx];
      ensureRevisionShape(rev);
      s.nutrition = {
        generalRules: JSON.parse(JSON.stringify(rev.generalRules || [])),
        categories: JSON.parse(JSON.stringify(rev.categories || [])),
        instructions: JSON.parse(JSON.stringify(rev.instructions || [])),
      };
    });
    setNri(nextIdx);
  };

  const [materialDraft, setMaterialDraft] = useState({ open: false, index: -1, text: "", url: "" });
  const materialInput = { padding: "7px 10px", borderRadius: 6, border: `1px solid ${$.brd}`, background: $.bgI, color: $.tx, fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%" };
  const normalizeMaterial = (inst) => {
    if (typeof inst === "string") return { text: inst, url: "" };
    return { text: String(inst?.text || ""), url: String(inst?.url || "") };
  };
  const openMaterialModal = (index = -1) => {
    if (readOnly) return;
    const current = index >= 0 ? normalizeMaterial(n.instructions?.[index]) : { text: "", url: "" };
    setMaterialDraft({ open: true, index, text: current.text, url: current.url });
  };
  const closeMaterialModal = () => setMaterialDraft({ open: false, index: -1, text: "", url: "" });
  const saveMaterialFromModal = () => {
    if (readOnly) return;
    const text = String(materialDraft.text || "").trim();
    const rawUrl = String(materialDraft.url || "").trim();
    if (!text) { alert("Введите текст материала"); return; }
    if (!rawUrl) { alert("Введите ссылку на материал"); return; }
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

    withNutritionRevision(rev => {
      const entry = { text, url };
      if (materialDraft.index >= 0 && materialDraft.index < rev.instructions.length) rev.instructions[materialDraft.index] = entry;
      else rev.instructions.push(entry);
    });

    closeMaterialModal();
  };

  return (
    <div>
      <div style={{ ...card({ padding: "12px 16px", marginBottom: 12 }), display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: $.txM, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, marginRight: 2 }}>Версия питания</span>
          {revisions.map((r, ri) => (
            <span key={ri} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <button onClick={() => setNri(ri)} style={{ padding: "5px 10px", borderRadius: 999, border: `1px solid ${ri === activeRevisionIndex ? $.ac : $.brd}`, background: ri === activeRevisionIndex ? `${$.ac}22` : $.bgI, color: ri === activeRevisionIndex ? $.ac : $.txS, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit" }}>{r.label}{r.date ? ` (${r.date})` : ""}</button>
              {!readOnly && revisions.length > 1 && <button onClick={() => removeNutritionRevision(ri)} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 11, padding: "2px 3px" }}>✕</button>}
            </span>
          ))}
          {!readOnly && <button onClick={addNutritionRevision} style={{ padding: "5px 10px", borderRadius: 999, border: `1px solid ${$.ac}`, background: $.bgI, color: $.ac, cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit" }}>+ Корректировка</button>}
        </div>
      </div>
      <div style={card({ marginBottom: 14 })}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📝 Комментарий врача к версии</div>
        <div style={{ fontSize: 11, color: $.txM, marginBottom: 10 }}>
          Здесь можно описать, что изменили в корректировке, на чем сделали акцент и что добавили.
        </div>
        <Ed
          ro={readOnly}
          v={n.comment || ""}
          f={`ncm-${activeRevisionIndex}`}
          ml
          fontSize={12}
          save={v => withNutritionRevision(rev => { rev.comment = String(v || ""); })}
        />
      </div>
      <div style={card({ marginBottom: 14 })}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📌 Рекомендации</div>
        {n.generalRules?.map((r, i) => <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${$.brd}`, display: "grid", gridTemplateColumns: "130px 1fr", gap: 12, fontSize: 13 }}><span style={{ fontWeight: 600, color: $.ac }}><Ed ro={readOnly} v={r.title} f={`nrt-${activeRevisionIndex}-${i}`} save={v => withNutritionRevision(rev => { rev.generalRules[i].title = v; })} /></span><Ed ro={readOnly} v={r.desc} f={`nrd-${activeRevisionIndex}-${i}`} ml save={v => withNutritionRevision(rev => { rev.generalRules[i].desc = v; })} /></div>)}
        {!readOnly && <button onClick={() => withNutritionRevision(rev => { rev.generalRules.push({ title: "Новое", desc: "" }); })} style={{ ...bt("g"), marginTop: 8, fontSize: 11 }}>+ Рекомендация</button>}
      </div>
      <div style={card({ marginBottom: 14, overflowX: "auto" })}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🥗 Продукты</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>{["Категория", "Продукты", "Инструкция", "Примеч.", ""].map(h => <th key={h} style={{ padding: "7px 8px", textAlign: "left", borderBottom: `2px solid ${$.ac}`, color: $.ac, fontSize: 11 }}>{h}</th>)}</tr>
          </thead>
          <tbody>{n.categories?.map((c2, i) => <tr key={i} style={{ borderBottom: `1px solid ${$.brd}` }}>
            <td style={{ padding: "7px 8px", fontWeight: 600 }}><Ed ro={readOnly} v={c2.name} f={`ncn-${activeRevisionIndex}-${i}`} save={v => withNutritionRevision(rev => { rev.categories[i].name = v; })} /></td>
            <td style={{ padding: "7px 8px", maxWidth: 280 }}><Ed ro={readOnly} v={c2.products} f={`ncp-${activeRevisionIndex}-${i}`} ml save={v => withNutritionRevision(rev => { rev.categories[i].products = v; })} /></td>
            <td style={{ padding: "7px 8px", color: $.ac }}><Ed ro={readOnly} v={c2.instruction} f={`nci-${activeRevisionIndex}-${i}`} save={v => withNutritionRevision(rev => { rev.categories[i].instruction = v; })} /></td>
            <td style={{ padding: "7px 8px", color: $.txS }}><Ed ro={readOnly} v={c2.notes} f={`ncnt-${activeRevisionIndex}-${i}`} save={v => withNutritionRevision(rev => { rev.categories[i].notes = v; })} /></td>
            <td>{!readOnly && <button onClick={() => withNutritionRevision(rev => { rev.categories.splice(i, 1); })} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn }}>✕</button>}</td>
          </tr>)}</tbody>
        </table>
        {!readOnly && <button onClick={() => withNutritionRevision(rev => { rev.categories.push({ name: "", products: "", instruction: "", notes: "" }); })} style={{ ...bt("g"), marginTop: 8, fontSize: 11 }}>+ Категория</button>}
      </div>
      <div style={card()}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📚 Материалы</div>
        {n.instructions?.map((inst, i) => {
          const obj = normalizeMaterial(inst);
          return (
            <div key={i} style={{ padding: "7px 0", borderBottom: `1px solid ${$.brd}`, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: $.ac, flexShrink: 0 }}>📎</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a
                  href={obj.url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => { if (!obj.url) { e.preventDefault(); if (!readOnly) openMaterialModal(i); } }}
                  style={{ color: obj.url ? $.in : $.txM, textDecoration: "underline", textUnderlineOffset: 2, fontWeight: 500, wordBreak: "break-word" }}
                  title={obj.url || "Добавьте ссылку через редактирование"}
                >
                  {obj.text || "Материал без названия"}
                </a>
              </div>
              {!readOnly && <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <button onClick={() => openMaterialModal(i)} style={{ ...bs, background: $.inD, color: $.in }}>✎</button>
                <button onClick={() => withNutritionRevision(rev => { rev.instructions.splice(i, 1); })} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 12 }}>✕</button>
              </div>}
            </div>
          );
        })}
        {!readOnly && <button onClick={() => openMaterialModal()} style={{ ...bt("g"), marginTop: 8, fontSize: 11 }}>+ Материал</button>}
      </div>
      {!readOnly && materialDraft.open && (
        <div onClick={closeMaterialModal} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(3px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 14, padding: 20, maxWidth: 520, width: "92%", boxShadow: $.sh }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700 }}>{materialDraft.index >= 0 ? "Редактировать материал" : "Новый материал"}</h3>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: $.txS }}>Текст ссылки</label>
              <input
                style={{ ...materialInput, marginTop: 4 }}
                value={materialDraft.text}
                onChange={e => setMaterialDraft(prev => ({ ...prev, text: e.target.value }))}
                placeholder="Например: Тарелка здорового питания (50/25/25)"
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: $.txS }}>Ссылка на материал</label>
              <input
                style={{ ...materialInput, marginTop: 4 }}
                value={materialDraft.url}
                onChange={e => setMaterialDraft(prev => ({ ...prev, url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveMaterialFromModal} style={{ ...bt(), flex: 1, padding: 10 }}>Сохранить</button>
              <button onClick={closeMaterialModal} style={{ ...bt("g"), flex: 1, padding: 10 }}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
