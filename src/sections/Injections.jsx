import InjectionPhaseModal from "../components/InjectionPhaseModal";
import InjectionsScheduleCard from "../components/InjectionsScheduleCard";
import { buildInjectionIcs, generateInjectionEvents, formatLocalIsoDate, parseLocalIsoDate } from "../utils/injectionSchedule";

const normalizeSchedule = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { startDate: "", phases: [] };
  }
  return {
    ...value,
    startDate: typeof value.startDate === "string" ? value.startDate : "",
    phases: Array.isArray(value.phases) ? value.phases : [],
  };
};

export default function InjectionsSection({
  injEditDraft,
  setInjEditDraft,
  injCalMonth,
  setInjCalMonth,
  st,
  uS,
  cl,
}) {
  const editDraft = injEditDraft;
  const setEditDraft = setInjEditDraft;
  const calMonth = injCalMonth;
  const setCalMonth = setInjCalMonth;
  const sch = normalizeSchedule(st.injectionSchedule);

  const ensureSchedule = (stage) => {
    stage.injectionSchedule = normalizeSchedule(stage.injectionSchedule);
    return stage.injectionSchedule;
  };

  const shiftAll = (delta) => {
    uS((s) => {
      const schedule = ensureSchedule(s);
      schedule.phases = (schedule.phases || []).map((ph) => {
        const d = parseLocalIsoDate(ph.startDate);
        if (!d) return ph;
        d.setDate(d.getDate() + delta);
        return { ...ph, startDate: formatLocalIsoDate(d) };
      });
    });
  };

  const events = generateInjectionEvents(sch);
  const evByDate = events.reduce((acc, ev) => {
    (acc[ev.dateIso] = acc[ev.dateIso] || []).push(ev);
    return acc;
  }, {});

  const exportIcs = () => {
    if (!events.length) return;
    const ics = buildInjectionIcs(events);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `injections-${(cl.shortName || cl.name).replace(/\s+/g, "-")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const todayIso = formatLocalIsoDate(new Date());
  const firstOfMonth = new Date(calMonth.y, calMonth.m, 1);
  const dow0 = firstOfMonth.getDay();
  const daysToSub = dow0 === 0 ? 6 : dow0 - 1;
  const calStart = new Date(calMonth.y, calMonth.m, 1 - daysToSub);
  const calWeeks = [];
  for (let w = 0; w < 6; w += 1) {
    const week = [];
    for (let dw = 0; dw < 7; dw += 1) {
      week.push(new Date(calStart.getFullYear(), calStart.getMonth(), calStart.getDate() + w * 7 + dw));
    }
    calWeeks.push(week);
    if (w >= 4 && week[6].getMonth() !== calMonth.m) break;
  }

  const savePhase = () => {
    const { _idx, ...ph } = editDraft;
    uS((s) => {
      const schedule = ensureSchedule(s);
      if (_idx === -1) schedule.phases.push(ph);
      else schedule.phases[_idx] = ph;
    });
    setEditDraft(null);
  };

  const addPhase = () => setEditDraft({
    _idx: -1,
    type: "daily",
    durationDays: 10,
    startDate: formatLocalIsoDate(new Date()),
    times: ["09:00"],
    daysOfWeek: [1, 3, 5],
    intervalDays: 2,
    drug: "",
    dosage: "",
    instruction: "",
  });

  const editPhase = (index, phase) => setEditDraft({ _idx: index, ...phase });

  const movePhase = (index, direction) => uS((s) => {
    const phases = ensureSchedule(s).phases;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= phases.length) return;
    [phases[index], phases[targetIndex]] = [phases[targetIndex], phases[index]];
  });

  const deletePhase = (index) => uS((s) => {
    ensureSchedule(s).phases.splice(index, 1);
  });

  const changeMonth = (delta) => setCalMonth((previous) => {
    const next = new Date(previous.y, previous.m + delta, 1);
    return { y: next.getFullYear(), m: next.getMonth() };
  });

  return (
    <div>
      <InjectionsScheduleCard
        phases={sch.phases || []}
        events={events}
        eventsByDate={evByDate}
        calendarMonth={calMonth}
        calendarWeeks={calWeeks}
        todayIso={todayIso}
        hasCalendar={(sch.phases || []).some((ph) => ph.startDate)}
        onShiftAll={shiftAll}
        onExportCalendar={exportIcs}
        onAddPhase={addPhase}
        onEditPhase={editPhase}
        onMovePhase={movePhase}
        onDeletePhase={deletePhase}
        onChangeMonth={changeMonth}
      />

      {editDraft && (
        <InjectionPhaseModal
          draft={editDraft}
          onChangeDraft={setEditDraft}
          onClose={() => setEditDraft(null)}
          onSave={savePhase}
        />
      )}
    </div>
  );
}
