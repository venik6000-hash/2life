import { getAutoDeficitsFromAnalytics } from "../utils/analyticsUtils";
import Ed from "../components/Ed";
import SexEd from "../components/SexEd";
import Card from "../components/Card";
import SectionTitle from "../components/SectionTitle";
import FieldRow from "../components/FieldRow";
import Wrapper from "../components/Wrapper";
import StatCard from "../components/StatCard";
import EditableTextListCard from "../components/EditableTextListCard";
import SeverityListCard from "../components/SeverityListCard";
import AutoDeficitCard from "../components/AutoDeficitCard";

export default function OverviewSection({
  st,
  pri,
  autoBmiValue,
  stageProfile,
  setMd,
  cl,
  uC,
  uS,
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
  const bmiNum = autoBmiValue;
  const sexOptions = ["", "Женский", "Мужской"];
  const openDeficitInAnalytics = (deficit) => {
    setSec("analytics");
    setAnalyticsJump({
      markerName: deficit.markerName,
      categoryName: deficit.categoryName,
      markerKey: deficit.markerKey,
      date: deficit.date,
      ts: Date.now(),
    });
  };
  const toggleDeficitSelection = (id, checked) => uS((s) => {
    const arr = s.autoDeficitSelection || (s.autoDeficitSelection = []);
    if (checked) {
      if (!arr.includes(id)) arr.push(id);
    } else {
      s.autoDeficitSelection = arr.filter((selectedId) => selectedId !== id);
    }
  });

  return (
    <div>
      <Wrapper columns="repeat(auto-fill,minmax(150px,1fr))" gap={10} marginBottom={18}>
        {[
          { label: "Вес", value: `${stageProfile.weightCurrent || "—"} кг`, description: `Цель: ${stageProfile.weightGoal || "—"}`, tone: "accent" },
          { label: "ИМТ", value: stageProfile.bmi || "—", description: Number.isFinite(bmiNum) ? (bmiNum < 25 ? "Норма" : "Избыток") : "—", tone: Number.isFinite(bmiNum) ? (bmiNum < 25 ? "accent" : "warning") : "warning" },
          { label: "Синдромы", value: st.syndromes?.length || 0, description: `${st.syndromes?.filter(x => x.severity === "high").length || 0} высоких, ${st.syndromes?.filter(x => x.severity === "medium").length || 0} средних`, tone: "danger" },
          { label: "Дефициты", value: autoDef.all.length || 0, description: autoDef.lastDate ? `${autoDef.all.length ? "актуально на " + autoDef.lastDate : "не выявлены на " + autoDef.lastDate}` : "нет анализов", tone: "warning" },
          { label: "Протокол", value: pc, description: "препаратов", tone: "purple" },
          { label: "Врач", value: st.doctor || "—", description: st.doctorRole || "Нажмите, чтобы выбрать", tone: "info", onClick: !readOnly ? () => setMd("docAssign") : undefined },
        ].map((k, i) => (
          <StatCard
            key={i}
            label={k.label}
            value={k.value}
            description={k.description}
            tone={k.tone}
            onClick={k.onClick}
          />
        ))}
      </Wrapper>

      <Wrapper marginBottom={14}>
        <Card>
          <Wrapper gap="sm">
            <SectionTitle>Профиль клиента</SectionTitle>
            <Wrapper columns="repeat(auto-fill,minmax(200px,1fr))" gap="sm">
          {[["Пол", "sex", "client"], ["ДР", "dob", "client"], ["Email", "email", "stage"], ["Тел", "phone", "stage"], ["Город", "city", "stage"], ["Рост", "height", "stage"], ["Вес", "weightCurrent", "stage"], ["Цель", "weightGoal", "stage"], ["Талия", "waist", "stage"]].map(([l, k, scope]) => {
            const value = scope === "client" ? cl[k] : stageProfile[k];
            const isSexField = k === "sex" && scope === "client";
            const fieldKey = `p-${scope}-${k}`;
            return (
              <FieldRow key={k} label={l}>
                {isSexField
                  ? <SexEd readOnly={readOnly} value={String(cl.sex || "")} editKey={fieldKey} options={sexOptions} onSave={nextValue => uC(c => { c.sex = nextValue; return c; })} />
                  : <Ed readOnly={readOnly} value={String(value || "")} editKey={fieldKey} onSave={v => scope === "client" ? uC(c => { c[k] = (k === "dob" || isNaN(+v)) ? v : +v; return c; }) : uS(s => { const numKeys = ["height", "weightCurrent", "weightGoal", "waist"]; s[k] = numKeys.includes(k) ? (isNaN(+v) || v === "" ? v : +v) : String(v); })} />}
              </FieldRow>
            );
          })}
            </Wrapper>
          </Wrapper>
        </Card>
      </Wrapper>

      <Wrapper columns="1fr 1fr" gap={12} marginBottom={12}>
        <EditableTextListCard
          title="🎯 Задачи"
          items={st.tasks}
          readOnly={readOnly}
          addLabel="+ Задача"
          onAdd={() => uS(s => { (s.tasks || (s.tasks = [])).push("Новая задача"); })}
          onSaveItem={(index, value) => uS(s => { s.tasks[index] = value; })}
          onDeleteItem={(index) => uS(s => { s.tasks.splice(index, 1); })}
        />
        <SeverityListCard
          title="⚡ Синдромы"
          items={st.syndromes}
          readOnly={readOnly}
          addLabel="+ Синдром"
          onAdd={() => uS(s => { (s.syndromes || (s.syndromes = [])).push({ name: "Новый синдром", severity: "medium" }); })}
          onDelete={(index) => uS(s => { s.syndromes.splice(index, 1); })}
          onSaveName={(index, value) => uS(s => { s.syndromes[index].name = value; })}
          onChangeSeverity={(index, value) => uS(s => { s.syndromes[index].severity = value; })}
        />
      </Wrapper>

      <Wrapper marginBottom={14}>
        <EditableTextListCard
          title="🩺 Диагнозы"
          items={st.diagnoses}
          readOnly={readOnly}
          addLabel="+ Диагноз"
          onAdd={() => uS(s => { (s.diagnoses || (s.diagnoses = [])).push("Новый диагноз"); })}
          onSaveItem={(index, value) => uS(s => { s.diagnoses[index] = value; })}
          onDeleteItem={(index) => uS(s => { s.diagnoses.splice(index, 1); })}
        />
      </Wrapper>

      <Wrapper marginBottom={14}>
        <AutoDeficitCard
          autoDef={autoDef}
          shownDeficits={shownDef}
          readOnly={readOnly}
          pickerOpen={defPickOpen}
          selectedIds={st.autoDeficitSelection || []}
          onTogglePicker={() => setDefPickOpen(v => !v)}
          onToggleDeficit={toggleDeficitSelection}
          onOpenDeficit={openDeficitInAnalytics}
        />
      </Wrapper>
    </div>
  );
}
