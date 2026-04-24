import { useState } from "react";
import DataFormatModal from "../components/DataFormatModal";
import DoctorAccessModal from "../components/DoctorAccessModal";
import DoctorAssignModal from "../components/DoctorAssignModal";
import DoctorsListModal from "../components/DoctorsListModal";
import NewClientModal from "../components/NewClientModal";
import NewStageModal from "../components/NewStageModal";

export default function ModalsSection({
  md,
  setMd,
  cl,
  st,
  doctors,
  setDoctors,
  setCls,
  uS,
  createClient,
  stageAutoTitle,
  todayLabel,
  uC,
  setSi,
  setPri,
}) {
  const [ncName, setNcName] = useState("");
  const [nsDoctor, setNsDoctor] = useState("");

  const close = () => setMd(null);
  const createNewClient = () => {
    const name = ncName.trim();
    if (!name) return alert("Введите ФИО");
    createClient({ name });
    setNcName("");
  };
  const createNewStage = () => {
    const curQ = JSON.parse(JSON.stringify(st.questionnaire || {}));
    const docMeta = doctors.find(d => d.name === nsDoctor);
    const createdAt = todayLabel();
    uC(c => {
      c.stages.forEach(s => { s.status = "completed"; });
      const nextNo = c.stages.length + 1;
      const prev = c.stages[c.stages.length - 1] || {};
      c.stages.push({
        id: nextNo,
        title: stageAutoTitle(nextNo),
        subtitle: "",
        doctor: nsDoctor,
        doctorRole: docMeta?.role || "",
        dateStart: createdAt,
        dateEnd: "",
        status: "active",
        email: prev.email ?? "",
        phone: prev.phone ?? "",
        city: prev.city ?? "",
        height: prev.height ?? "",
        weightCurrent: prev.weightCurrent ?? "",
        weightGoal: prev.weightGoal ?? "",
        bmi: prev.bmi ?? "",
        waist: prev.waist ?? "",
        tasks: [],
        syndromes: [],
        diagnoses: [],
        deficits: [],
        nutrition: { generalRules: [], categories: [], instructions: [] },
        nutritionRevisions: [{ id: 1, date: createdAt, label: "Стартовый", comment: "", generalRules: [], categories: [], instructions: [] }],
        protocolRevisions: [{ id: 1, date: "", label: "Стартовый", groups: [] }],
        injections: null,
        analyticsCategories: [],
        journal: [],
        questionnaire: curQ,
      });
      return c;
    });
    setSi(cl.stages.length);
    setPri(0);
    setNsDoctor("");
    close();
  };
  const changeAssignedDoctor = (name) => {
    const doc = doctors.find(d => d.name === name);
    uS(s => { s.doctor = name; s.doctorRole = doc?.role || ""; });
  };
  const clearAssignedDoctor = () => {
    uS(s => { s.doctor = ""; s.doctorRole = ""; });
    close();
  };
  const changeDoctorAt = (index, nextDoctor) => {
    setDoctors(prev => prev.map((doctor, ix) => ix === index ? nextDoctor : doctor));
  };
  const deleteDoctorAt = (index) => {
    const oldName = doctors[index]?.name || "";
    setDoctors(prev => prev.filter((_, ix) => ix !== index));
    if (oldName) {
      setCls(prev => prev.map(client => ({
        ...client,
        stages: (client.stages || []).map(stage =>
          stage.doctor === oldName ? { ...stage, doctor: "", doctorRole: "" } : stage
        ),
      })));
    }
  };
  const saveDoctors = () => {
    const prevDoctors = doctors;
    const cleaned = doctors.filter(d => d.name || d.role);
    setCls(prev => prev.map(client => ({
      ...client,
      stages: (client.stages || []).map(stage => {
        const prevDoc = prevDoctors.find(d => d.name === stage.doctor);
        if (!prevDoc) return stage;
        const nextDoc = cleaned.find(d => d.name === prevDoc.name) || cleaned.find(d => d.role === prevDoc.role && d.name) || prevDoc;
        return { ...stage, doctor: nextDoc.name || stage.doctor, doctorRole: nextDoc.role || stage.doctorRole || "" };
      }),
    })));
    setDoctors(cleaned);
    close();
  };

  const mds = {
    sh: () => (
      <DoctorAccessModal clientId={cl.id} onClose={close} />
    ),

    df: () => (
      <DataFormatModal onClose={close} />
    ),

    newCl: () => (
      <NewClientModal
        name={ncName}
        onChangeName={setNcName}
        onCreate={createNewClient}
        onClose={close}
      />
    ),

    newSt: () => {
      const nextNo = (cl.stages?.length || 0) + 1;
      return (
        <NewStageModal
          title={stageAutoTitle(nextNo)}
          doctor={nsDoctor}
          doctors={doctors}
          date={todayLabel()}
          onChangeDoctor={setNsDoctor}
          onCreate={createNewStage}
          onClose={close}
        />
      );
    },

    docAssign: () => (
      <DoctorAssignModal
        doctor={st.doctor || ""}
        doctors={doctors}
        onChangeDoctor={changeAssignedDoctor}
        onClearDoctor={clearAssignedDoctor}
        onClose={close}
      />
    ),

    docs: () => (
      <DoctorsListModal
        doctors={doctors}
        onChangeDoctor={changeDoctorAt}
        onDeleteDoctor={deleteDoctorAt}
        onAddDoctor={() => setDoctors(p => [...p, { name: "", role: "" }])}
        onSave={saveDoctors}
        onClose={close}
      />
    ),
  };

  return md && mds[md]?.();
}
