import { useState, useRef, useEffect } from "react";
import { sanitizePrintHtml } from "./utils/helpers";
import { useTheme } from "./context/ThemeContext";
import { useDashboard, SECTIONS } from "./context/DashboardContext";
import Sidebar from "./sections/Sidebar";
import Header from "./sections/Header";
import JournalSection from "./sections/Journal";
import LabOrderSection from "./sections/LabOrder";
import OverviewSection from "./sections/Overview";
import NutritionSection from "./sections/Nutrition";
import InjectionsSection from "./sections/Injections";
import ProtocolSection from "./sections/Protocol";
import AnalyticsSection from "./sections/Analytics";
import QuestionnaireSection from "./sections/Questionnaire";
import ModalsSection from "./sections/Modals";
import AdminSection from "./sections/AdminSection";

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
  const { $: themeColors, dk: isDarkTheme } = useTheme();
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
  } = useDashboard();
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

  const cardStyle = x=>({background:themeColors.bgC,border:`1px solid ${themeColors.brd}`,borderRadius:10,padding:18,...x});
  const inputStyle = {padding:"6px 10px",borderRadius:6,border:`1px solid ${themeColors.brd}`,background:themeColors.bgI,color:themeColors.tx,fontSize:13,fontFamily:"inherit",outline:"none",width:"100%"};
  const buttonStyle = v=>({padding:"7px 14px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,fontFamily:"inherit",background:v==="g"?"transparent":themeColors[v]||themeColors.ac,color:v==="g"?themeColors.txS:"#fff",...(v==="g"?{border:`1px solid ${themeColors.brd}`}:{}),transition:"all .15s"});
  const smallButtonStyle = {padding:"4px 8px",borderRadius:5,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:"inherit"};

  const modalsProps = {
    setMd: setActiveModalId,
    $: themeColors,
    inp: inputStyle,
    bt: buttonStyle,
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

  if(!loaded) return <div style={{background:themeColors.bg,color:themeColors.tx,height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif"}}><div style={{textAlign:"center"}}><div style={{fontSize:32,marginBottom:12}}>⏳</div><div style={{fontSize:15,fontWeight:600,color:themeColors.ac}}>2life</div><div style={{fontSize:12,color:themeColors.txM,marginTop:4}}>Загрузка данных...</div></div></div>;
  if(!currentClient||!currentStage) return <div style={{background:themeColors.bg,color:themeColors.tx,height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif"}}>
    <div style={{textAlign:"center"}}>
      <div style={{fontSize:15,color:themeColors.txS}}>Нет клиентов</div>
      {canCreateClient && <button onClick={()=>setActiveModalId("newCl")} style={{marginTop:12,padding:"8px 16px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,background:themeColors.ac,color:"#fff"}}>+ Создать клиента</button>}
    </div>
    <ModalsSection md={activeModalId==="newCl" ? "newCl" : null} {...modalsProps} />
  </div>;

  const printSectionToPdf = () => {
    const w = window.open('', '_blank');
    const sectionLabel = SECTIONS.find(s => s.id === activeSectionId)?.lb || "Отчёт";
    const printContent = sanitizePrintHtml(printContentRef.current?.innerHTML || "");
    const css = `*,*::before,*::after{box-sizing:border-box}body{font-family:'Segoe UI',-apple-system,Arial,sans-serif;background:#fff;color:#1a1f2e;font-size:13px;line-height:1.65;padding:0;margin:0}.page{padding:44px 52px;max-width:900px;margin:0 auto}.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:1px solid #e8eaf0}.name{font-size:21px;font-weight:700;color:#1a1f2e;letter-spacing:-.3px;margin-bottom:4px}.sub{font-size:12px;color:#6b7a99}.meta{text-align:right;font-size:12px;color:#6b7a99;line-height:1.9}.badge{display:inline-block;font-size:10px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#6b7a99;border:1px solid #e8eaf0;padding:3px 10px;border-radius:4px;margin-bottom:8px}.ftr{margin-top:36px;padding-top:12px;border-top:1px solid #e8eaf0;display:flex;justify-content:space-between;font-size:10px;color:#b0b8cc;letter-spacing:.3px}table{width:100%;border-collapse:collapse;margin:10px 0}th{background:#f5f7fa;color:#6b7a99;font-weight:600;font-size:11px;padding:8px 12px;text-align:left;border-bottom:2px solid #e8eaf0;letter-spacing:.4px;text-transform:uppercase}td{padding:7px 12px;border-bottom:1px solid #f0f2f6;vertical-align:top}button{display:none!important}input,select,textarea{border:none!important;background:transparent!important;padding:0!important;color:#1a1f2e!important;-webkit-appearance:none;appearance:none}@media print{.page{padding:0}@page{margin:18mm 22mm;size:A4 portrait}}`;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${currentClient.name} — ${sectionLabel}</title><style>${css}</style></head><body><div class="page"><div class="hdr"><div><div class="name">${currentClient.name}</div><div class="sub">Этап ${currentStage.id}: ${currentStage.title}${currentStage.doctor ? ` · ${currentStage.doctor}` : ""}</div></div><div class="meta"><div class="badge">${sectionLabel}</div><div>${todayLabel()}</div>${currentClient.dob ? `<div>${currentClient.dob}</div>` : ""}</div></div><div>${printContent}</div><div class="ftr"><span>${currentClient.name} · ${sectionLabel}</span><span>${todayLabel()}</span></div></div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  // OVERVIEW
  const renderOverviewSection = () => (
    <OverviewSection
      st={currentStage}
      pri={protocolRevisionIndex}
      doctors={doctors}
      autoBmiValue={autoBmiValue}
      stageProfile={stageProfile}
      card={cardStyle}
      setMd={setActiveModalId}
      $={themeColors}
      cl={currentClient}
      uC={updateClient}
      uS={updateStage}
      bt={buttonStyle}
      setSec={setActiveSectionId}
      setAnalyticsJump={setAnalyticsJumpTarget}
      defPickOpen={isDeficitPickerOpen}
      setDefPickOpen={setIsDeficitPickerOpen}
      deficitPresets={deficitPresets}
      readOnly={!canWriteSection("overview")}
    />
  );
  // NUTRITION
  const renderNutritionSection = () => (
    <NutritionSection
      st={currentStage}
      nri={nutritionRevisionIndex}
      setNri={setNutritionRevisionIndex}
      card={cardStyle}
      $={themeColors}
      bt={buttonStyle}
      uS={updateStage}
      todayLabel={todayLabel}
      bs={smallButtonStyle}
      readOnly={!canWriteSection("nutrition")}
    />
  );
  // PROTOCOL
  const renderProtocolSection = () => (
    <ProtocolSection
      st={currentStage}
      pri={protocolRevisionIndex}
      setPri={setProtocolRevisionIndex}
      card={cardStyle}
      $={themeColors}
      dk={isDarkTheme}
      bt={buttonStyle}
      bs={smallButtonStyle}
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
      $={themeColors}
      bt={buttonStyle}
      card={cardStyle}
    />
  );
 // ANALYTICS
  const renderAnalyticsSection = () => (
    <AnalyticsSection
      st={currentStage}
      collapseStorageKey={`${currentClient.id}::${currentStage.id}`}
      card={cardStyle}
      $={themeColors}
      bt={buttonStyle}
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
      card={cardStyle}
      $={themeColors}
      bt={buttonStyle}
      uS={updateStage}
      importStageExcel={importStageExcel}
      canImportData={canImportData}
      readOnly={!canWriteSection("questionnaire")}
    />
  );
  const renderJournalSection = () => (
    <JournalSection
      st={currentStage}
      card={cardStyle}
      $={themeColors}
      inp={inputStyle}
      uS={updateStage}
      bt={buttonStyle}
    />
  );

  const renderLabOrderSection = () => (
    <LabOrderSection
      st={currentStage}
      card={cardStyle}
      $={themeColors}
      bt={buttonStyle}
      uS={updateStage}
      cl={currentClient}
      todayLabel={todayLabel}
      labOpenGroups={openLabGroups}
      setLabOpenGroups={setOpenLabGroups}
      labOrderTemplates={labOrderTemplates}
    />
  );

  // MODALS
  const RenderModals = () => (
    <ModalsSection md={activeModalId} {...modalsProps} />
  );
  const sectionRenderers = {
    overview: renderOverviewSection,
    questionnaire: renderQuestionnaireSection,
    nutrition: renderNutritionSection,
    protocol: renderProtocolSection,
    injections: renderInjectionsSection,
    analytics: renderAnalyticsSection,
    lab: renderLabOrderSection,
    journal: renderJournalSection,
    admin: () => <AdminSection />
  };
  const isSectionReadOnly = activeSectionId !== "admin" && !canWriteSection(activeSectionId);

  return(
    <div style={{background:themeColors.bg,color:themeColors.tx,height:"100vh",fontFamily:"'Segoe UI',-apple-system,sans-serif",display:"flex",transition:"all .2s",overflow:"hidden"}}>
      <Sidebar />
      <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,minWidth:0}}>
        {activeSectionId !== "admin" && <Header pdf={printSectionToPdf} />}
        <div ref={mainScrollRef} onScroll={e=>{if(activeSectionId==="analytics") localStorage.setItem("dash_analytics_scroll_y", String(e.currentTarget.scrollTop))}} style={{flex:1,overflow:"auto",padding:activeSectionId==="admin"?0:20,minWidth:0}}>
          {isSectionReadOnly && (
            <div style={{marginBottom:10,padding:"8px 10px",borderRadius:8,border:`1px solid ${themeColors.brd}`,background:themeColors.bgI,fontSize:12,color:themeColors.txM}}>
              Режим только просмотра: для этого раздела запрещено редактирование.
            </div>
          )}
          <div
            ref={printContentRef}
            style={{
              ...(activeSectionId==="admin"?{height:"100%"}:{}),
              ...(isSectionReadOnly && activeSectionId === "questionnaire" ? { pointerEvents: "none" } : {})
            }}
          >
            {(sectionRenderers[activeSectionId]||renderOverviewSection)()}
          </div>
        </div>
      </div>
      <RenderModals />
    </div>
  );
}
