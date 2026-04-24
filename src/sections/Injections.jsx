import InjectionPhaseModal from "../components/InjectionPhaseModal";
import InjectionsScheduleCard from "../components/InjectionsScheduleCard";

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

  const fmtIso = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
  const parseD = (iso) => {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };

  const shiftAll = (delta) => {
    uS((s) => {
      const schedule = ensureSchedule(s);
      schedule.phases = (schedule.phases || []).map((ph) => {
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
      for (let day = 0; day < (ph.durationDays || 1); day += 1) {
        const d = new Date(phStart.getFullYear(), phStart.getMonth(), phStart.getDate() + day);
        let ok = false;
        if (ph.type === "daily") ok = true;
        else if (ph.type === "weekdays") ok = (ph.daysOfWeek || []).includes(d.getDay());
        else if (ph.type === "interval") ok = (day % (ph.intervalDays || 1) === 0);
        if (ok) {
          evs.push({
            dateIso: fmtIso(d),
            drug: ph.drug || "?",
            dosage: ph.dosage || "",
            instruction: ph.instruction || "",
            times: ph.times || ["09:00"],
          });
        }
      }
    }
    return evs;
  };

  const events = genEvents();
  const evByDate = events.reduce((acc, ev) => {
    (acc[ev.dateIso] = acc[ev.dateIso] || []).push(ev);
    return acc;
  }, {});

  const exportIcs = () => {
    if (!events.length) return;
    const pad = (n) => String(n).padStart(2, "0");
    const toDt = (iso, t) => {
      const [y, mo, d] = iso.split("-");
      const [h, mi] = (t || "09:00").split(":");
      return `${y}${mo}${d}T${pad(h)}${pad(mi)}00`;
    };
    const esc = (s) => String(s || "").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//2life//Injections//RU\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n";
    let uid = 0;
    for (const ev of events) {
      for (const t of ev.times) {
        const dt = toDt(ev.dateIso, t);
        ics += `BEGIN:VEVENT\r\nUID:inj-${++uid}@2life\r\nDTSTAMP:${toDt(fmtIso(new Date()), "00:00")}\r\nDTSTART:${dt}\r\nDTEND:${dt}\r\nSUMMARY:Инъекция: ${esc(ev.drug)}${ev.dosage ? ` ${esc(ev.dosage)}` : ""}\r\n${ev.instruction ? `DESCRIPTION:${esc(ev.instruction)}\r\n` : ""}END:VEVENT\r\n`;
      }
    }
    ics += "END:VCALENDAR";
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `injections-${(cl.shortName || cl.name).replace(/\s+/g, "-")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const todayIso = fmtIso(new Date());
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
    startDate: fmtIso(new Date()),
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
