import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { escapeHtml, PRINT_DOCUMENT_CSP, sanitizePrintHtml } from "./utils/helpers";
import { useDashboard, SECTIONS, isClientRole } from "./context/DashboardContext";
import { useAuth } from "./context/AuthContext";
import Sidebar from "./sections/Sidebar";
import DashboardHeader from "./components/DashboardHeader";
const JournalSection = lazy(() => import("./sections/Journal"));
const LabOrderSection = lazy(() => import("./sections/LabOrder"));
import OverviewSection from "./sections/Overview";
const NutritionSection = lazy(() => import("./sections/Nutrition"));
const MenuSection = lazy(() => import("./sections/Menu"));
const InjectionsSection = lazy(() => import("./sections/Injections"));
const ProtocolSection = lazy(() => import("./sections/Protocol"));
const AnalyticsSection = lazy(() => import("./sections/Analytics"));
const QuestionnaireSection = lazy(() => import("./sections/Questionnaire"));
import ModalsSection from "./sections/Modals";
const AdminSection = lazy(() => import("./sections/AdminSection"));
const MessengerSection = lazy(() => import("./sections/Messenger"));
const WaveSection = lazy(() => import("./sections/Wave"));
import LoadingScreen from "./components/LoadingScreen";
import NoClientsScreen from "./components/NoClientsScreen";
import DashboardShell from "./components/DashboardShell";

const stageAutoTitle = (stageNumber) => {
  if (stageNumber === 2) return "Энергобуст";
  if (stageNumber === 3) return "Новая жизнь";
  if (stageNumber === 4) return "Долголетие 120+";
  return `Этап ${stageNumber}`;
};

const todayLabel = () => {
  const now = new Date();
  return `${String(now.getDate()).padStart(2,"0")}.${String(now.getMonth()+1).padStart(2,"0")}.${now.getFullYear()}`;
};

export default function Dashboard() {
  const {
    setCls: setClients,
    cid: clientId,
    si: stageIndex,
    setSi: setStageIndex,
    sec: activeSectionId,
    setSec: setActiveSectionId,
    md: activeModalId,
    setMd: setActiveModalId,
    pri: protocolRevisionIndex,
    setPri: setProtocolRevisionIndex,
    nri: nutritionRevisionIndex,
    setNri: setNutritionRevisionIndex,
    doctors,
    setDoctors,
    deficitPresets,
    labOrderTemplates,
    loaded,
    bootstrapSlow,
    retryBootstrap,
    cl: currentClient,
    st: currentStage,
    stageProfile,
    autoBmiValue,
    uC: updateClient,
    uS: updateStage,
    createClient,
    importStageExcel,
    canWriteSection,
    canCreateClient,
    canImportData,
    reloadJournalBadges,
  } = useDashboard();
  const { user } = useAuth();
  const isClient = isClientRole(user);
  const [isDeficitPickerOpen, setIsDeficitPickerOpen] = useState(false);
  const [analyticsJumpTarget, setAnalyticsJumpTarget] = useState(null);
  const [protocolMode, setProtocolMode] = useState("builder");
  const [openLabGroups, setOpenLabGroups] = useState(()=>new Set());
  const [injectionEditDraft, setInjectionEditDraft] = useState(null);
  const [injectionCalendarMonth, setInjectionCalendarMonth] = useState(()=>{ const d=new Date(); return {y:d.getFullYear(),m:d.getMonth()}; });
  useEffect(()=>{
    if(!analyticsJumpTarget?.ts) return;
    const t = setTimeout(()=>{
      setAnalyticsJumpTarget(cur=>cur?.ts===analyticsJumpTarget.ts ? null : cur);
    }, 2200);
    return ()=>clearTimeout(t);
  }, [analyticsJumpTarget]);
  const printContentRef = useRef(null);
  const mainScrollRef = useRef(null);
  useEffect(()=>{
    if(activeSectionId!=="analytics" || analyticsJumpTarget) return;
    const y = Number(localStorage.getItem("dash_analytics_scroll_y") || 0);
    if(!mainScrollRef.current) return;
    requestAnimationFrame(()=>{
      if(mainScrollRef.current) mainScrollRef.current.scrollTop = y;
    });
  },[activeSectionId, clientId, stageIndex, analyticsJumpTarget]);

  const modalsProps = {
    setMd: setActiveModalId,
    cl: currentClient,
    st: currentStage,
    doctors,
    setDoctors,
    setCls: setClients,
    uS: updateStage,
    createClient,
    stageAutoTitle,
    todayLabel,
    uC: updateClient,
    setSi: setStageIndex,
    setPri: setProtocolRevisionIndex,
  };

  if(!loaded) return <LoadingScreen slow={bootstrapSlow} onRetry={retryBootstrap} />;
  if(!currentClient||!currentStage) return (
    <NoClientsScreen
      canCreateClient={canCreateClient}
      onCreateClient={() => setActiveModalId("newCl")}
    >
      <ModalsSection md={activeModalId==="newCl" ? "newCl" : null} {...modalsProps} />
    </NoClientsScreen>
  );

  const printSectionToPdf = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const sectionLabel = SECTIONS.find(s => s.id === activeSectionId)?.lb || "Отчёт";
    const printContent = sanitizePrintHtml(printContentRef.current?.innerHTML || "");
    const safeClientName = escapeHtml(currentClient.name);
    const safeSectionLabel = escapeHtml(sectionLabel);
    const safeStageId = escapeHtml(currentStage.id);
    const safeStageTitle = escapeHtml(currentStage.title);
    const safeDoctor = escapeHtml(currentStage.doctor);
    const safeToday = escapeHtml(todayLabel());
    const safeDob = escapeHtml(currentClient.dob);
    const css = `*,*::before,*::after{box-sizing:border-box}body{font-family:'Segoe UI',-apple-system,Arial,sans-serif;background:#fff;color:#1a1f2e;font-size:13px;line-height:1.65;padding:0;margin:0}.page{padding:44px 52px;max-width:900px;margin:0 auto}.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:1px solid #e8eaf0}.name{font-size:21px;font-weight:700;color:#1a1f2e;letter-spacing:-.3px;margin-bottom:4px}.sub{font-size:12px;color:#6b7a99}.meta{text-align:right;font-size:12px;color:#6b7a99;line-height:1.9}.badge{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#6b7a99;border:1px solid #e8eaf0;padding:3px 10px;border-radius:4px;margin-bottom:8px}.ftr{margin-top:36px;padding-top:12px;border-top:1px solid #e8eaf0;display:flex;justify-content:space-between;font-size:10px;color:#b0b8cc;letter-spacing:.3px}table{width:100%;border-collapse:collapse;margin:10px 0}th{background:#f5f7fa;color:#6b7a99;font-weight:600;font-size:11px;padding:8px 12px;text-align:left;border-bottom:2px solid #e8eaf0;letter-spacing:.4px;text-transform:uppercase}td{padding:7px 12px;border-bottom:1px solid #f0f2f6;vertical-align:top}button{display:none!important}input,select,textarea{border:none!important;background:transparent!important;padding:0!important;color:#1a1f2e!important;-webkit-appearance:none;appearance:none}@media print{.page{padding:0}@page{margin:18mm 22mm;size:A4 portrait}}`;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PRINT_DOCUMENT_CSP}"><title>${safeClientName} — ${safeSectionLabel}</title><style>${css}</style></head><body><div class="page"><div class="hdr"><div><div class="name">${safeClientName}</div><div class="sub">Этап ${safeStageId}: ${safeStageTitle}${safeDoctor ? ` · ${safeDoctor}` : ""}</div></div><div class="meta"><div class="badge">${safeSectionLabel}</div><div>${safeToday}</div>${safeDob ? `<div>${safeDob}</div>` : ""}</div></div><div>${printContent}</div><div class="ftr"><span>${safeClientName} · ${safeSectionLabel}</span><span>${safeToday}</span></div></div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  // OVERVIEW
  const renderOverviewSection = () => (
    <OverviewSection
      st={currentStage}
      pri={protocolRevisionIndex}
      autoBmiValue={autoBmiValue}
      stageProfile={stageProfile}
      setMd={setActiveModalId}
      cl={currentClient}
      uC={updateClient}
      uS={updateStage}
      setSec={setActiveSectionId}
      setAnalyticsJump={setAnalyticsJumpTarget}
      defPickOpen={isDeficitPickerOpen}
      setDefPickOpen={setIsDeficitPickerOpen}
      deficitPresets={deficitPresets}
      readOnly={!canWriteSection("overview")}
      hideDiagnoses={isClient}
    />
  );
  // NUTRITION
  const renderNutritionSection = () => (
    <NutritionSection
      st={currentStage}
      nri={nutritionRevisionIndex}
      setNri={setNutritionRevisionIndex}
      uS={updateStage}
      todayLabel={todayLabel}
      readOnly={!canWriteSection("nutrition")}
    />
  );
  const renderMenuSection = () => (
    <MenuSection
      cl={currentClient}
      readOnly={!canWriteSection("menu")}
    />
  );
  // PROTOCOL
  const renderProtocolSection = () => (
    <ProtocolSection
      st={currentStage}
      pri={protocolRevisionIndex}
      setPri={setProtocolRevisionIndex}
      uS={updateStage}
      protMode={protocolMode}
      setProtMode={setProtocolMode}
      todayLabel={todayLabel}
      readOnly={!canWriteSection("protocol")}
    />
  );
  // INJECTIONS
  const renderInjectionsSection = () => (
    <InjectionsSection
      injEditDraft={injectionEditDraft}
      setInjEditDraft={setInjectionEditDraft}
      injCalMonth={injectionCalendarMonth}
      setInjCalMonth={setInjectionCalendarMonth}
      st={currentStage}
      uS={updateStage}
      cl={currentClient}
    />
  );
 // ANALYTICS
  const renderAnalyticsSection = () => (
    <AnalyticsSection
      st={currentStage}
      clientId={currentClient?.id}
      collapseStorageKey={`${currentClient.id}::${currentStage.id}`}
      uS={updateStage}
      analyticsJump={analyticsJumpTarget}
      setAnalyticsJump={setAnalyticsJumpTarget}
      todayLabel={todayLabel}
      importStageExcel={importStageExcel}
      canImportData={canImportData}
      readOnly={!canWriteSection("analytics")}
    />
  );
  // QUESTIONNAIRE
  const renderQuestionnaireSection = () => (
    <QuestionnaireSection
      st={currentStage}
      uS={updateStage}
      importStageExcel={importStageExcel}
      canImportData={canImportData}
      readOnly={!canWriteSection("questionnaire")}
    />
  );
  const renderJournalSection = () => (
    <JournalSection
      clientId={currentClient.id}
      stages={currentClient.stages || []}
      currentStageId={currentStage?.id}
      readOnly={!canWriteSection("journal")}
      onChanged={reloadJournalBadges}
    />
  );

  const renderLabOrderSection = () => (
    <LabOrderSection
      st={currentStage}
      uS={updateStage}
      cl={currentClient}
      todayLabel={todayLabel}
      labOpenGroups={openLabGroups}
      setLabOpenGroups={setOpenLabGroups}
      labOrderTemplates={labOrderTemplates}
    />
  );

  const sectionRenderers = {
    overview: renderOverviewSection,
    questionnaire: renderQuestionnaireSection,
    nutrition: renderNutritionSection,
    menu: renderMenuSection,
    protocol: renderProtocolSection,
    injections: renderInjectionsSection,
    analytics: renderAnalyticsSection,
    lab: renderLabOrderSection,
    journal: renderJournalSection,
    messenger: () => <MessengerSection />,
    wave: () => <WaveSection />,
    admin: () => <AdminSection />
  };
  const isSectionReadOnly = activeSectionId !== "admin" && !canWriteSection(activeSectionId);

  return (
    <DashboardShell
      sidebar={<Sidebar />}
      header={activeSectionId !== "admin" ? <DashboardHeader onPrintPdf={printSectionToPdf} /> : null}
      modals={<ModalsSection md={activeModalId} {...modalsProps} />}
      activeSectionId={activeSectionId}
      readOnly={isSectionReadOnly}
      mainRef={mainScrollRef}
      printRef={printContentRef}
      onMainScroll={(e) => {
        if (activeSectionId === "analytics") {
          localStorage.setItem("dash_analytics_scroll_y", String(e.currentTarget.scrollTop));
        }
      }}
    >
      <Suspense fallback={<div style={{ padding: 24, fontSize: 13, opacity: .6 }}>Загрузка раздела…</div>}>
        {(sectionRenderers[activeSectionId] || renderOverviewSection)()}
      </Suspense>
    </DashboardShell>
  );
}
