import { useState } from "react";
import NutritionCommentCard from "../components/NutritionCommentCard";
import NutritionEmptyCard from "../components/NutritionEmptyCard";
import NutritionMaterialModal from "../components/NutritionMaterialModal";
import NutritionMaterialsCard, { normalizeMaterial } from "../components/NutritionMaterialsCard";
import NutritionProductsCard from "../components/NutritionProductsCard";
import NutritionRecommendationsCard from "../components/NutritionRecommendationsCard";
import NutritionRevisionHeader from "../components/NutritionRevisionHeader";

export default function NutritionSection({ st, nri, setNri, uS, todayLabel, readOnly = false }) {
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
  if (!n) return <NutritionEmptyCard />;

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
      <NutritionRevisionHeader
        revisions={revisions}
        activeIndex={activeRevisionIndex}
        readOnly={readOnly}
        onSelect={setNri}
        onDelete={removeNutritionRevision}
        onAdd={addNutritionRevision}
      />
      <NutritionCommentCard
        value={n.comment || ""}
        revisionIndex={activeRevisionIndex}
        readOnly={readOnly}
        onSave={v => withNutritionRevision(rev => { rev.comment = String(v || ""); })}
      />
      <NutritionRecommendationsCard
        rules={n.generalRules || []}
        revisionIndex={activeRevisionIndex}
        readOnly={readOnly}
        onSaveTitle={(index, value) => withNutritionRevision(rev => { rev.generalRules[index].title = value; })}
        onSaveDescription={(index, value) => withNutritionRevision(rev => { rev.generalRules[index].desc = value; })}
        onAdd={() => withNutritionRevision(rev => { rev.generalRules.push({ title: "Новое", desc: "" }); })}
      />
      <NutritionProductsCard
        categories={n.categories || []}
        revisionIndex={activeRevisionIndex}
        readOnly={readOnly}
        onSaveField={(index, field, value) => withNutritionRevision(rev => { rev.categories[index][field] = value; })}
        onDelete={(index) => withNutritionRevision(rev => { rev.categories.splice(index, 1); })}
        onAdd={() => withNutritionRevision(rev => { rev.categories.push({ name: "", products: "", instruction: "", notes: "" }); })}
      />
      <NutritionMaterialsCard
        instructions={n.instructions || []}
        readOnly={readOnly}
        onOpen={openMaterialModal}
        onDelete={(index) => withNutritionRevision(rev => { rev.instructions.splice(index, 1); })}
      />
      {!readOnly && materialDraft.open && (
        <NutritionMaterialModal
          draft={materialDraft}
          onChange={setMaterialDraft}
          onClose={closeMaterialModal}
          onSave={saveMaterialFromModal}
        />
      )}
    </div>
  );
}
