import Ed from "../components/Ed";
import Badge from "../components/Badge";
import ScoreBar from "../components/ScoreBar";
import StressScale from "../components/StressScale";

export default function QuestionnaireSection({ st, card, $, bt, uS, importStageExcel, canImportData, readOnly = false }) {
  const Bd = Badge;
  const SB = ScoreBar;
const q=st.questionnaire;if(!q)return<div style={card()}><div style={{fontSize:13,fontWeight:700,marginBottom:10}}>📋 Анкета здоровья</div><div style={{fontSize:12,color:$.txM,marginBottom:10}}>Не заполнено</div>{canImportData&&!readOnly&&<label style={{...bt("g"),color:$.ac,borderColor:$.ac,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4}}>📥 Загрузить анкету<input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;try{await importStageExcel(file,"questionnaire")}catch(err){alert("Ошибка загрузки: "+err.message)}}}/></label>}</div>;const qv=q.normalized||q;const qBase=q.normalized?"normalized.":"";
    if(q.structure==="sections" && !q.normalized){
      const fmtAns = (answers=[]) => answers.filter(Boolean).join(", ");
      const sectionOrder = [
        "Самочувствие",
        "Внешний вид",
        "Пищеварение",
        "Женское здоровье",
        "Мужское здоровье",
        "Дыхательная система",
        "Сердечно-сосудистая система",
        "Скелетно-мышечная система",
        "Имунная система",
        "Питание и пищевые привычки",
        "Физическая активность",
        "Уровень стресса",
        "Вредные привычки",
        "Анамез",
        "Прием витаминов и медикаментов",
        "Наследственность и генетика",
        "Оценка готовности"
      ];
      const sortedSections = [...(q.sections||[])].sort((a,b)=>{
        const ai = sectionOrder.indexOf(a.title);
        const bi = sectionOrder.indexOf(b.title);
        if(ai===-1 && bi===-1) return a.title.localeCompare(b.title);
        if(ai===-1) return 1;
        if(bi===-1) return -1;
        return ai-bi;
      });
      const getScore = (answers=[]) => {
        for(const ans of answers||[]){
          const s = String(ans).trim().replace(",", ".");
          if(/^\d+(?:\.\d+)?$/.test(s)){
            const n = +s;
            if(n>=1 && n<=10) return n;
          }
        }
        return null;
      };
      const isCommentLike = (txt="") => /комментар/i.test(String(txt||""));
      const renderQA = (qq, qi, gr) => {
        const answers = (qq.answers||[]).filter(Boolean);
        const score = getScore(answers);
        const label = qq.prompt===gr.title ? gr.title : qq.prompt;
        if(score!=null){
          return <div key={qi} style={{padding:"8px 0",borderBottom:`1px solid ${$.brd}`}}>
            <div style={{fontSize:12,color:$.txS,marginBottom:6}}>{label}</div>
            <SB s={score}/>
          </div>
        }
        const oneLine = answers.length<=1;
        return <div key={qi} style={{padding:"7px 0",borderBottom:`1px solid ${$.brd}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:oneLine?"center":"flex-start",gap:12}}>
            <div style={{minWidth:140,color:$.txS,fontSize:12,fontWeight:label===gr.title&&gr.title!==gr.sectionTitle?600:500}}>{label}</div>
            <div style={{flex:1,textAlign:"right"}}>{oneLine?<span style={{fontSize:13,fontWeight:500,borderBottom:`1px dashed ${$.brd}`,paddingBottom:1}}>{fmtAns(answers)||"—"}</span>:<div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"flex-end"}}>{answers.map((ans,ai)=><Bd key={ai} c="in" ch={ans}/>)}</div>}</div>
          </div>
        </div>
      };
      return(<div>
        <div style={card({marginBottom:14})}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:0}}>
            <div style={{fontSize:13,fontWeight:700}}>📋 Анкета здоровья</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {canImportData&&!readOnly&&<label style={{...bt("g"),fontSize:11,color:$.ac,borderColor:$.ac,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4}}>📥 Загрузить анкету<input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;try{await importStageExcel(file,"questionnaire")}catch(err){alert("Ошибка загрузки: "+err.message)}}}/></label>}
              {!readOnly&&<button onClick={()=>{if(confirm("Очистить анкету текущего этапа?"))uS(s=>{s.questionnaire={}})}} style={{...bt("g"),fontSize:11,color:$.dn,borderColor:$.dn}}>Очистить анкету</button>}
            </div>
          </div>
          <div style={{fontSize:11,color:$.txM,marginTop:6}}>Во вкладке отображается только медицинская часть анкеты. Контакты и антропометрия находятся в обзоре.</div>
          {!sortedSections.length&&<div style={{fontSize:12,color:$.txM,marginTop:10}}>После импорта анкеты медицинские ответы сюда не попали. Проверьте парсер или загрузите более полный файл.</div>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {sortedSections.map((sec2,si2)=>{
            const sectionComments = [...(sec2.comments||[])];
            const groups = (sec2.groups||[]).map(gr=>({
              ...gr,
              sectionTitle: sec2.title,
              questions: (gr.questions||[]).filter(q2=>!isCommentLike(q2.prompt))
            }));
            return <div key={si2} style={card({marginBottom:0})}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:$.ac}}>{sec2.title}</div>
              {groups.map((gr,gi)=>{
                const hasRows = (gr.questions||[]).length>0;
                if(!hasRows && !(gr.title && gr.title!==sec2.title)) return null;
                return <div key={gi} style={{marginBottom:12}}>
                  {gr.title && gr.title!==sec2.title && <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>{gr.title}</div>}
                  <div style={{display:"grid",gap:0}}>{(gr.questions||[]).map((qq,qi)=>renderQA(qq,qi,gr))}</div>
                </div>
              })}
              {!!sectionComments.length&&<div style={{marginTop:6}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{display:"grid",gap:6}}>{sectionComments.map((cmt,ci)=><div key={ci} style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}>{cmt}</div>)}</div></div>}
            </div>
          })}
        </div>
      </div>)
    }
    const tr={"score":"Оценка","peak":"Пик","frequency":"Частота","duration":"Длительность","manifestation":"Проявления","type":"Тип","quality":"Качество","bedtime":"Отбой","issues":"Проблемы","skin":"Кожа","nails":"Ногти","hair":"Волосы","symptoms":"Симптомы","tongue":"Язык","libido":"Либидо","potency":"Потенция","urological":"Урология","painUrination":"Боль при мочеиспускании","weakStream":"Вялая струя","bloodPressure":"Артериальное давление","arrhythmia":"Нарушение ритма","heartPain":"Боли в сердце","heartPainTriggers":"После чего усиливается","heartPainFrequency":"Как часто","coldViral":"Простудные и вирусные заболевания","covid19":"COVID-19","postCovidChanges":"Изменения после COVID-19","herpes":"Герпес","allergy":"Аллергия","allergyDuration":"Как давно длится","autoimmune":"Аутоимунные заболевания","healthyDietPercent":"Придерживается здорового рациона","habitualDiet":"Привычный рацион","foodReactionAllergy":"Реакция на еду, аллергия","cravings":"Тяга к продуктам","cravingsDegree":"Степень тяги","sugarUse":"Употребление сахара","sugarCoffeeTea":"В кофе, чае","sugarSweetsDesserts":"Сладости, десерты","regularCarbs":"Углеводы на регулярной основе","proteinMain":"Основной белок в рационе","proteinFrequency":"Как часто едите белок","redMeat":"Красное мясо в рационе","fishSeafood":"Рыба и морепродукты в рационе","proteinComments":"Комментарии к блоку Белок","level":"Уровень","sources":"Источники","coping":"Как справляется","alcohol":"Алкоголь","stimulants":"Стимуляторы","chronic":"Хронические","meds":"Лекарства","heredity":"Наследственность","orviFreq":"Частота ОРВИ","cycle":"Цикл","pms":"ПМС","comments":"Комментарии"};
    const wellbeingSpec = [
      {key:"energy", title:"1. Уровень энергии", icon:"⚡", items:[["peak","1.1. Пик энергии у вас"],["frequency","1.2. Как часто"],["duration","1.3. Как давно длится"]]},
      {key:"anxiety", title:"2. Тревожность", icon:"😰", items:[["manifestation","2.1. Проявление"],["frequency","2.2. Как часто"],["duration","2.3. Как давно длится"]]},
      {key:"mood", title:"3. Настроение", icon:"🙂", items:[["manifestation","3.1. Какое у вас настроение"],["frequency","3.2. Как часто"],["duration","3.3. Как давно длится"]]},
      {key:"sleep", title:"4. Качество сна", icon:"😴", items:[["quality","4.1. Как спите"],["frequency","4.2. Как часто"],["duration","4.3. Как давно длится"],["bedtime","4.4. Отход ко сну"]]},
      {key:"focus", title:"5. Концентрация и память", icon:"🎯", items:[["quality","5.1. Оцените качество"],["frequency","5.2. Как часто"],["duration","5.3. Как давно длится"]]}
    ];
    const saveQField = (path, key, nv) => uS(s=>{
      const pts = path.split(".");
      let o = s.questionnaire;
      pts.forEach(p=>{ if(o[p]) o=o[p]; });
      o[key] = key==="score" ? ((nv===""||Number.isNaN(+nv)) ? nv : +nv) : nv;
    });
    const WellbeingCard = ({spec}) => {
      const data = qv.wellbeing?.[spec.key] || {};
      const scoreRaw = data.score;
      const score = scoreRaw==null || scoreRaw==="" || Number.isNaN(+scoreRaw) ? null : +scoreRaw;
      const path = `${qBase}wellbeing.${spec.key}`;
      return <div style={card({marginBottom:10,fontFamily:"inherit"})}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:10}}>
          <div style={{fontSize:13,fontWeight:700,color:$.ac}}>{spec.icon} {spec.title}</div>
          <div style={{minWidth:130}}>{score!=null ? <SB s={score} invert={spec.key==="anxiety"}/> : <div style={{fontSize:11,color:$.txM,textAlign:"right"}}>Нет оценки</div>}</div>
        </div>
        {spec.items.map(([field,label])=><div key={field} style={{padding:"6px 0",borderBottom:`1px solid ${$.brd}`,display:"flex",gap:10,alignItems:"flex-start",fontSize:12,lineHeight:1.45,fontFamily:"inherit"}}>
          <span style={{fontSize:12,color:$.txS,flex:"0 0 145px",maxWidth:"45%"}}>{label}</span>
          <span style={{fontSize:12,lineHeight:1.45,fontFamily:"inherit",flex:1,minWidth:0}}><Ed v={data[field]==null?"":String(data[field])} f={`q-${path}-${field}`} save={nv=>saveQField(path,field,nv)}/></span>
        </div>)}
      </div>;
    };
    const Bl=({tl,data,path})=>{if(!data||typeof data!=="object")return null;const entries=Object.entries(data).filter(([k,v])=>k!=="comments"&&v!=null&&v!=="");const comments=data.comments;const isStress=path.endsWith("stress");return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>{tl}</div>
        {entries.map(([k,v])=><div key={k} style={{padding:"5px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"flex",gap:10,alignItems:isStress&&k==="level"?"flex-start":"flex-start"}}><span style={{color:$.txS,fontSize:12,flex:"0 0 145px",maxWidth:"45%"}}>{tr[k]||k}</span>
          <span style={{flex:1,minWidth:0}}>{k==="score"?<SB s={v}/>:typeof v==="object"&&!Array.isArray(v)?<span style={{color:$.txM}}>[...]</span>:isStress&&k==="level"?<div style={{display:"grid",gap:8,justifyItems:"start"}}><StressScale value={v}/><Ed v={String(v)} f={`q-${path}-${k}`} save={nv=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o[k]=nv})}/></div>:<Ed v={String(v)} f={`q-${path}-${k}`} save={nv=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o[k]=(k==="score"||!isNaN(+nv))?+nv||nv:nv})}/>}</span>
        </div>)}
        {comments?<div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(comments)} f={`q-${path}-comments`} ml save={nv=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o.comments=nv})}/></div></div>:null}
      </div>)};
    const AppearanceCard=({data,path})=>{if(!data||typeof data!=="object")return null;const setField=(k,nv)=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o[k]=nv});const qa=(k,label,sub=false)=><div key={k} style={{padding:sub?"4px 0 4px 12px":"6px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:sub?$.txM:$.txS,fontSize:12,flex:"0 0 145px",maxWidth:"45%"}}>{label}</span><span style={{fontSize:12,lineHeight:1.45,flex:1,minWidth:0}}><Ed v={String(data[k]??"")} f={`q-${path}-${k}`} save={nv=>setField(k,nv)}/></span></div>;return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>👤 Внешний вид</div>
        {qa("skinState","1. Состояние кожи")}
        <div style={{paddingTop:2}}>
          {qa("skinRash","2. Высыпания на коже")}
          {qa("skinRashFrequency","Как часто?",true)}
        </div>
        <div style={{paddingTop:2}}>
          {qa("edema","3. Отёки")}
          {qa("edemaFrequency","Как часто?",true)}
        </div>
        {qa("hair","4. Волосы")}
        {qa("nails","5. Ногти")}
        <div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.comments??"")} f={`q-${path}-comments`} ml save={nv=>setField("comments",nv)}/></div></div>
      </div>)};
    const DigestionCard=({data,path})=>{if(!data||typeof data!=="object")return null;const setField=(k,nv)=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o[k]=nv});const qa=(k,label,sub=false)=><div key={k} style={{padding:sub?"4px 0 4px 12px":"6px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:sub?$.txM:$.txS,fontSize:12,flex:"0 0 145px",maxWidth:"45%"}}>{label}</span><span style={{fontSize:12,lineHeight:1.45,flex:1,minWidth:0}}><Ed v={String(data[k]??"")} f={`q-${path}-${k}`} save={nv=>setField(k,nv)}/></span></div>;return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>🫃 Пищеварение</div>
        <div style={{paddingTop:2}}>
          {qa("afterMealSensation","1. Ощущение после еды")}
          {qa("afterMealDuration","1.1. Как давно длится",true)}
        </div>
        {qa("tongueState","2. Состояние языка")}
        {qa("breathOdor","3. Запах из рта")}
        <div style={{paddingTop:2}}>
          {qa("stool","4. Стул")}
          {qa("stoolFrequency","4.1. Частота",true)}
        </div>
        <div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.comments??"")} f={`q-${path}-comments`} ml save={nv=>setField("comments",nv)}/></div></div>
      </div>)};
    const MaleHealthCard=({data,path})=>{if(!data||typeof data!=="object")return null;const setField=(k,nv)=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o[k]=nv});const qa=(k,label)=><div key={k} style={{padding:"6px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:$.txS,fontSize:12,flex:"0 0 145px",maxWidth:"45%"}}>{label}</span><span style={{fontSize:12,lineHeight:1.45,flex:1,minWidth:0}}><Ed v={String(data[k]??"")} f={`q-${path}-${k}`} save={nv=>setField(k,nv)}/></span></div>;return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>♂️ Мужское здоровье</div>
        {qa("libido","1. Либидо")}
        {qa("potency","2. Потенция")}
        {qa("painUrination","3. Боль при мочеиспускании")}
        {qa("weakStream","4. Вялая струя")}
        <div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.comments??"")} f={`q-${path}-comments`} ml save={nv=>setField("comments",nv)}/></div></div>
      </div>)};
    const RespiratoryCard=({data,path})=>{if(!data||typeof data!=="object")return null;const setField=(k,nv)=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o[k]=nv});const qa=(k,label,sub=false)=><div key={k} style={{padding:sub?"4px 0 4px 12px":"6px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:sub?$.txM:$.txS,fontSize:12,flex:"0 0 145px",maxWidth:"45%"}}>{label}</span><span style={{fontSize:12,lineHeight:1.45,flex:1,minWidth:0}}><Ed v={String(data[k]??"")} f={`q-${path}-${k}`} save={nv=>setField(k,nv)}/></span></div>;return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>🫁 Дыхательная система</div>
        <div style={{paddingTop:2}}>
          {qa("breathingIssue","1. Нарушение дыхания")}
          {qa("breathingIssueFrequency","1.1. Как часто",true)}
        </div>
        {qa("cough","2. Кашель")}
        {qa("smoking","3. Вы курите?")}
        <div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.comments??"")} f={`q-${path}-comments`} ml save={nv=>setField("comments",nv)}/></div></div>
      </div>)};
    const CardioCard=({data,path})=>{if(!data||typeof data!=="object")return null;const setField=(k,nv)=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o[k]=nv});const qa=(k,label,sub=false)=><div key={k} style={{padding:sub?"4px 0 4px 12px":"6px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:sub?$.txM:$.txS,fontSize:12,flex:"0 0 145px",maxWidth:"45%"}}>{label}</span><span style={{fontSize:12,lineHeight:1.45,flex:1,minWidth:0}}><Ed v={String(data[k]??"")} f={`q-${path}-${k}`} save={nv=>setField(k,nv)}/></span></div>;return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>❤️ Сердечно-сосудистая система</div>
        {qa("bloodPressure","1. Артериальное давление")}
        {qa("arrhythmia","2. Нарушение ритма")}
        <div style={{paddingTop:2}}>
          {qa("heartPain","3. Боли в сердце")}
          {qa("heartPainTriggers","3.1. После чего усиливается",true)}
          {qa("heartPainFrequency","3.2. Как часто",true)}
        </div>
        <div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.comments??"")} f={`q-${path}-comments`} ml save={nv=>setField("comments",nv)}/></div></div>
      </div>)};
    const MusculoskeletalCard=({data,path})=>{if(!data||typeof data!=="object")return null;const setField=(k,nv)=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o[k]=nv});const qa=(k,label,sub=false)=><div key={k} style={{padding:sub?"4px 0 4px 12px":"6px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:sub?$.txM:$.txS,fontSize:12,flex:"0 0 145px",maxWidth:"45%"}}>{label}</span><span style={{fontSize:12,lineHeight:1.45,flex:1,minWidth:0}}><Ed v={String(data[k]??"")} f={`q-${path}-${k}`} save={nv=>setField(k,nv)}/></span></div>;return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>🦴 Скелетно-мышечная система</div>
        <div style={{paddingTop:2}}>
          {qa("neckBackLowerBackDiscomfort","1. Дискомфорт в шее, спине, пояснице")}
          {qa("neckBackLowerBackFrequency","1.1. Как часто",true)}
        </div>
        {qa("muscleDiscomfort","2. Дискомфорт в мышцах")}
        <div style={{paddingTop:2}}>
          {qa("jointDiscomfort","3. Дискомфорт в суставах")}
          {qa("jointManifestation","3.1. Как проявляется",true)}
          {qa("jointFrequency","3.2. Как часто",true)}
        </div>
        {qa("legEdema","4. Отеки ног")}
        <div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.comments??"")} f={`q-${path}-comments`} ml save={nv=>setField("comments",nv)}/></div></div>
      </div>)};
    const ImmuneCard=({data,path})=>{if(!data||typeof data!=="object")return null;const setField=(k,nv)=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o[k]=nv});const qa=(k,label,sub=false)=><div key={k} style={{padding:sub?"4px 0 4px 12px":"6px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:sub?$.txM:$.txS,fontSize:12,flex:"0 0 145px",maxWidth:"45%"}}>{label}</span><span style={{fontSize:12,lineHeight:1.45,flex:1,minWidth:0}}><Ed v={String(data[k]??"")} f={`q-${path}-${k}`} save={nv=>setField(k,nv)}/></span></div>;return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>🛡️ Имунная система</div>
        {qa("coldViral","1. Простудные и вирусные заболевания")}
        <div style={{paddingTop:2}}>
          {qa("covid19","2. COVID-19")}
          {qa("postCovidChanges","2.1. Какие изменения в самочувствии после",true)}
        </div>
        {qa("herpes","3. Герпес")}
        <div style={{paddingTop:2}}>
          {qa("allergy","4. Аллергия")}
          {qa("allergyDuration","4.1. Как давно длится",true)}
        </div>
        {qa("autoimmune","5. Аутоимунные заболевания")}
        <div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.comments??"")} f={`q-${path}-comments`} ml save={nv=>setField("comments",nv)}/></div></div>
      </div>)};
    const ActivityCard=({data,path})=>{if(!data||typeof data!=="object")return null;const setField=(k,nv)=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o[k]=nv});const qa=(k,label)=><div key={k} style={{padding:"6px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:$.txS,fontSize:12,flex:"0 0 145px",maxWidth:"45%"}}>{label}</span><span style={{fontSize:12,lineHeight:1.45,flex:1,minWidth:0}}><Ed v={String(data[k]??"")} f={`q-${path}-${k}`} save={nv=>setField(k,nv)}/></span></div>;return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>🏃 Физическая активность</div>
        {qa("activityType","1. Вид физической активности")}
        {qa("regularity","2. Регулярность")}
        {qa("sessionDuration","3. Длительность занятий")}
        {qa("fitnessTolerance","4. Переносимость фитнеса")}
        {qa("dailyActivity","5. Ежедневная активность")}
        <div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.comments??"")} f={`q-${path}-comments`} ml save={nv=>setField("comments",nv)}/></div></div>
      </div>)};
    const StressCard=({data,path})=>{if(!data||typeof data!=="object")return null;const setField=(k,nv)=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});if(k==="level"){const n=+String(nv).replace(",",".").replace("%","").trim();o[k]=Number.isFinite(n)?Math.max(0,Math.min(100,n)):nv;return}o[k]=nv});const qa=(k,label,sub=false)=><div key={k} style={{padding:sub?"4px 0 4px 12px":"6px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:sub?$.txM:$.txS,fontSize:12,flex:"0 0 165px",maxWidth:"48%"}}>{label}</span><span style={{fontSize:12,lineHeight:1.45,flex:1,minWidth:0}}><Ed v={String(data[k]??"")} f={`q-${path}-${k}`} save={nv=>setField(k,nv)}/></span></div>;const lvlRaw=data.level;const lvl=Number.isFinite(+lvlRaw)?Math.max(0,Math.min(100,+lvlRaw)):null;const tone=lvl==null?$.txM:(lvl>=70?$.dn:lvl>=40?$.wr:$.ac);return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>🧘 Уровень стресса</div>
        <div style={{padding:"6px 0",borderBottom:`1px solid ${$.brd}`,display:"grid",gridTemplateColumns:"minmax(180px,42%) minmax(0,1fr)",columnGap:14,alignItems:"start"}}>
          <span style={{color:$.txS,fontSize:12,whiteSpace:"normal",overflowWrap:"anywhere"}}>1. Оцените уровень стресса</span>
          <span style={{flex:1,minWidth:0,display:"grid",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{flex:1,height:9,background:$.bgI,borderRadius:999,overflow:"hidden"}}><div style={{height:"100%",width:`${lvl==null?0:lvl}%`,background:tone,borderRadius:999,transition:"width .5s"}}/></div>
              <span style={{fontSize:12,fontWeight:700,color:tone,minWidth:44,textAlign:"right"}}>{lvl==null?"—":`${lvl}%`}</span>
            </div>
          </span>
        </div>
        {qa("sources","2. Источники стресса")}
        {qa("duration","3. Длительность стресса")}
        {qa("coping","4. Работа со стрессом")}
        <div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.comments??"")} f={`q-${path}-comments`} ml save={nv=>setField("comments",nv)}/></div></div>
      </div>)};
    const HabitsCard=({data,path})=>{if(!data||typeof data!=="object")return null;const setField=(k,nv)=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o[k]=nv});const qa=(k,label)=><div key={k} style={{padding:"6px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:$.txS,fontSize:12,flex:"0 0 170px",maxWidth:"48%"}}>{label}</span><span style={{fontSize:12,lineHeight:1.45,flex:1,minWidth:0}}><Ed v={String(data[k]??"")} f={`q-${path}-${k}`} save={nv=>setField(k,nv)}/></span></div>;return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>🚫 Вредные привычки</div>
        {qa("alcohol","1. Алкоголь")}
        {qa("alcoholDrinks","2. Какие напитки употребляете")}
        {qa("stimulants","3. Стимуляторы")}
        <div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.comments??"")} f={`q-${path}-comments`} ml save={nv=>setField("comments",nv)}/></div></div>
      </div>)};
    const AnamnesCard=({data,path})=>{if(!data||typeof data!=="object")return null;const setField=(k,nv)=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});o[k]=nv});const qa=(k,label)=><div key={k} style={{padding:"6px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"flex",gap:10,alignItems:"flex-start"}}><span style={{color:$.txS,fontSize:12,flex:"0 0 195px",maxWidth:"48%"}}>{label}</span><span style={{fontSize:12,lineHeight:1.45,flex:1,minWidth:0}}><Ed v={String(data[k]??"")} f={`q-${path}-${k}`} save={nv=>setField(k,nv)}/></span></div>;return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>📜 Анамнез</div>
        {qa("chronicDiseases","1. Хронические заболевания")}
        {qa("oncology","2. Онкологические заболевания")}
        {qa("surgeriesTrauma","3. Операции, тяжелые травмы")}
        {qa("severeInfections","4. Тяжелые инфекции")}
        {qa("checkups","5. Обследования")}
        <div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.comments??"")} f={`q-${path}-comments`} ml save={nv=>setField("comments",nv)}/></div></div>
      </div>)};
    const NutritionQuestionnaireCard=({data,path})=>{if(!data||typeof data!=="object")return null;const setField=(k,nv)=>uS(s=>{const pts=path.split(".");let o=s.questionnaire;pts.forEach(p=>{if(o[p])o=o[p]});if(k==="healthyDietPercent"){const n=+String(nv).replace(",",".").replace("%","").trim();o[k]=Number.isFinite(n)?Math.max(0,Math.min(100,n)):nv;return}o[k]=nv});const qa=(k,label,sub=false)=><div key={k} style={{padding:sub?"4px 0 4px 12px":"6px 0",borderBottom:`1px solid ${$.brd}`,fontSize:12,lineHeight:1.45,display:"grid",gridTemplateColumns:"minmax(180px,42%) minmax(0,1fr)",columnGap:14,alignItems:"start"}}><span style={{color:sub?$.txM:$.txS,fontSize:12,whiteSpace:"normal",overflowWrap:"anywhere"}}>{label}</span><span style={{fontSize:12,lineHeight:1.45,minWidth:0}}><Ed v={String(data[k]??"")} f={`q-${path}-${k}`} save={nv=>setField(k,nv)}/></span></div>;const pRaw=data.healthyDietPercent;const pct=Number.isFinite(+pRaw)?Math.max(0,Math.min(100,+pRaw)):null;const tone=pct==null?$.txM:(pct>=70?$.ac:pct>=40?$.wr:$.dn);return(
      <div style={card({marginBottom:10})}><div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>🍽️ Питание и пищевые привычки</div>
        <div style={{padding:"6px 0",borderBottom:`1px solid ${$.brd}`,display:"grid",gridTemplateColumns:"minmax(180px,42%) minmax(0,1fr)",columnGap:14,alignItems:"start"}}>
          <span style={{color:$.txS,fontSize:12,whiteSpace:"normal",overflowWrap:"anywhere"}}>1. На сколько вы придерживаетесь здорового рациона</span>
          <span style={{flex:1,minWidth:0,display:"grid",gap:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{flex:1,height:9,background:$.bgI,borderRadius:999,overflow:"hidden"}}><div style={{height:"100%",width:`${pct==null?0:pct}%`,background:tone,borderRadius:999,transition:"width .5s"}}/></div>
              <span style={{fontSize:12,fontWeight:700,color:tone,minWidth:44,textAlign:"right"}}>{pct==null?"—":`${pct}%`}</span>
            </div>
          </span>
        </div>
        <div style={{marginTop:10}}>
          {qa("habitualDiet","2. Ваш привычный рацион")}
          {qa("foodReactionAllergy","3. Реакция на еду, аллергия")}
          <div style={{paddingTop:2}}>
            {qa("cravings","4. Есть ли тяга к определенным продуктам?")}
            {qa("cravingsDegree","4.1. Степень тяги",true)}
          </div>
          <div style={{paddingTop:2}}>
            {qa("sugarUse","5. Употребление сахара")}
            {qa("sugarCoffeeTea","5.1. В кофе, чае",true)}
            {qa("sugarSweetsDesserts","5.2. Сладости, десерты",true)}
          </div>
          {qa("regularCarbs","6. Углеводы в рационе на регулярной основе")}
        </div>
        <div style={{marginTop:10}}>
          <div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div>
          <div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}>
            <Ed v={String(data.comments??"")} f={`q-${path}-comments`} ml save={nv=>setField("comments",nv)}/>
          </div>
        </div>
        <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={card({marginBottom:0,padding:12})}>
            <div style={{fontSize:12,fontWeight:700,color:$.ac,marginBottom:6}}>Белок</div>
            {qa("proteinMain","1. Основной белок в рационе")}
            {qa("proteinFrequency","2. Как часто едите белок")}
            {qa("redMeat","3. Красное мясо в рационе")}
            {qa("fishSeafood","4. Рыба и морепродукты в рационе")}
            <div style={{marginTop:8}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.proteinComments??"")} f={`q-${path}-proteinComments`} ml save={nv=>setField("proteinComments",nv)}/></div></div>
          </div>
          <div style={card({marginBottom:0,padding:12})}>
            <div style={{fontSize:12,fontWeight:700,color:$.ac,marginBottom:6}}>Жиры</div>
            {qa("fatsMain","1. Основные жиры в рационе")}
            {qa("fatsFrequency","2. Как часто едите жиры?")}
            {qa("friedFoodGolden","3. Жаренная пища до золотистой корочки")}
            {qa("transFatsLabels","4. Читаете на этикетках трансжиры")}
            <div style={{marginTop:8}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.fatsComments??"")} f={`q-${path}-fatsComments`} ml save={nv=>setField("fatsComments",nv)}/></div></div>
          </div>
          <div style={card({marginBottom:0,padding:12})}>
            <div style={{fontSize:12,fontWeight:700,color:$.ac,marginBottom:6}}>Овощи, фрукты, клетчатка</div>
            {qa("fiberVegetables","1. Овощи в рационе")}
            {qa("fiberFruits","2. Фрукты в рационе")}
            {qa("fiberTracking","3. Следите за количеством потребляемой клетчатки")}
            <div style={{marginTop:8}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.fiberComments??"")} f={`q-${path}-fiberComments`} ml save={nv=>setField("fiberComments",nv)}/></div></div>
          </div>
          <div style={card({marginBottom:0,padding:12})}>
            <div style={{fontSize:12,fontWeight:700,color:$.ac,marginBottom:6}}>Питьевой режим</div>
            {qa("hydrationWaterAmount","1. Сколько чистой воды пьёте")}
            {qa("hydrationOtherDrinks","2. Какие напитки ещё употребляете в течение дня")}
            {qa("hydrationCoffee","3. Кофе")}
            <div style={{marginTop:8}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.hydrationComments??"")} f={`q-${path}-hydrationComments`} ml save={nv=>setField("hydrationComments",nv)}/></div></div>
          </div>
          <div style={card({marginBottom:0,padding:12})}>
            <div style={{fontSize:12,fontWeight:700,color:$.ac,marginBottom:6}}>Режим питания</div>
            {qa("mealMealsPerDay","1. Сколько приёмов пищи в день")}
            {qa("mealSnacks","2. Перекусы")}
            {qa("mealStressEating","3. Заедаете ли вы стресс и усталость")}
            {qa("mealBreakfast","4. Завтрак")}
            {qa("mealBreakfastProducts","5. Привычные продукты на завтрак")}
            {qa("mealLunch","6. Обед")}
            {qa("mealLunchWhereWorkdays","7. Где обедаете в рабочие дни")}
            {qa("mealDinner","8. Ужин")}
            {qa("mealDinnerTime","9. Время ужина")}
            {qa("mealDinnerComposition","10. Ужин как правило состоит из")}
            <div style={{marginTop:8}}><div style={{fontSize:12,fontWeight:700,marginBottom:6,color:$.wr}}>Комментарии</div><div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:12,lineHeight:1.55}}><Ed v={String(data.mealRegimenComments??"")} f={`q-${path}-mealRegimenComments`} ml save={nv=>setField("mealRegimenComments",nv)}/></div></div>
          </div>
        </div>
      </div>)};
    const normTxt = (v)=>String(v||"").toLowerCase().replace(/ё/g,"е").trim();
    const hasObjData = (obj)=>!!(obj&&typeof obj==="object"&&Object.entries(obj).some(([k,v])=>k!=="comments"&&v!=null&&String(v).trim()!=="") || (obj&&obj.comments!=null&&String(obj.comments).trim()!==""));
    const sectionTitles = (q.sections||[]).map(s=>normTxt(s.title));
    const hasMaleSection = sectionTitles.includes("мужское здоровье");
    const hasFemaleSection = sectionTitles.includes("женское здоровье");
    const hasMaleData = hasObjData(qv.maleHealth);
    const hasFemaleData = hasObjData(qv.femaleHealth);
    let healthMode = null;
    if (hasMaleSection && !hasFemaleSection) healthMode = "male";
    else if (hasFemaleSection && !hasMaleSection) healthMode = "female";
    else if (q.gender === "male") healthMode = "male";
    else if (q.gender === "female") healthMode = "female";
    else if (hasMaleData && !hasFemaleData) healthMode = "male";
    else if (hasFemaleData && !hasMaleData) healthMode = "female";
    else if (hasMaleData) healthMode = "male";
    else if (hasFemaleData) healthMode = "female";
    return(<div>
      <div style={card({marginBottom:14})}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:0}}>
          <div style={{fontSize:13,fontWeight:700}}>📋 Анкета здоровья</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {canImportData&&!readOnly&&<label style={{...bt("g"),fontSize:11,color:$.ac,borderColor:$.ac,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4}}>📥 Загрузить анкету<input type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;try{await importStageExcel(file,"questionnaire")}catch(err){alert("Ошибка загрузки: "+err.message)}}}/></label>}
            {!readOnly&&<button onClick={()=>{if(confirm("Очистить анкету текущего этапа?"))uS(s=>{s.questionnaire={}})}} style={{...bt("g"),fontSize:11,color:$.dn,borderColor:$.dn}}>Очистить анкету</button>}
          </div>
        </div>
        <div style={{fontSize:11,color:$.txM,marginTop:6}}>Во вкладке отображается только медицинская часть анкеты. Контакты и антропометрия находятся в обзоре.</div>
        {!Object.values(qv||{}).some(v=>v&&typeof v==="object"&&Object.keys(v).length)&&<div style={{fontSize:12,color:$.txM,marginTop:10}}>После импорта анкеты медицинские ответы сюда не попали. Проверьте парсер или загрузите более полный файл.</div>}
      </div>
      {qv.wellbeing&&<div style={card({marginBottom:14,borderColor:$.ac})}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:$.ac}}>🧠 Самочувствие</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:12,marginBottom:12}}>
          {[["energy","Энергия"],["anxiety","Тревожность"],["mood","Настроение"],["sleep","Сон"],["focus","Концентрация"]].map(([key,label])=>{
            const raw = qv.wellbeing?.[key]?.score;
            const score = raw==null || raw==="" || Number.isNaN(+raw) ? null : +raw;
            return <div key={key}>
              <div style={{fontSize:12,color:$.txS,marginBottom:4}}>{label}</div>
              {score!=null
                ? <SB s={score} invert={key==="anxiety"}/>
                : <div style={{fontSize:12,color:$.txM,padding:"6px 0"}}>Нет оценки</div>}
            </div>;
          })}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {wellbeingSpec.map(spec=><WellbeingCard key={spec.key} spec={spec}/>)}
        </div>
        {qv.wellbeing?.comments&&<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${$.brd}`}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:$.ac}}>📝 Комментарий к блоку самочувствие</div>
          <div style={{padding:"10px 12px",borderRadius:10,background:$.bgI,fontSize:13,lineHeight:1.5,fontFamily:"inherit"}}>
            <Ed v={String(qv.wellbeing.comments)} f={`q-${qBase}wellbeing-comments`} ml save={nv=>saveQField(`${qBase}wellbeing`,"comments",nv)}/>
          </div>
        </div>}
      </div>}
      {qv.nutrition&&<div style={{marginBottom:10}}>
        <NutritionQuestionnaireCard data={qv.nutrition} path={`${qBase}nutrition`}/>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {qv.appearance&&<AppearanceCard data={qv.appearance} path={`${qBase}appearance`}/>}
        {qv.digestion&&<DigestionCard data={qv.digestion} path={`${qBase}digestion`}/>}
        {healthMode==="male"&&<MaleHealthCard data={qv.maleHealth||{}} path={`${qBase}maleHealth`}/>}
        {healthMode==="female"&&qv.femaleHealth&&<Bl tl="♀️ Жен. здоровье" data={qv.femaleHealth} path={`${qBase}femaleHealth`}/>}
        {qv.immune&&<ImmuneCard data={qv.immune} path={`${qBase}immune`}/>}
        {qv.stress&&<StressCard data={qv.stress} path={`${qBase}stress`}/>}
        {qv.habits&&<HabitsCard data={qv.habits} path={`${qBase}habits`}/>}
        {qv.history&&<AnamnesCard data={qv.history} path={`${qBase}history`}/>}
        {qv.cardio&&<CardioCard data={qv.cardio} path={`${qBase}cardio`}/>}
        {qv.respiratory&&<RespiratoryCard data={qv.respiratory} path={`${qBase}respiratory`}/>}
        {qv.musculoskeletal&&<MusculoskeletalCard data={qv.musculoskeletal} path={`${qBase}musculoskeletal`}/>}
        {qv.activity&&<ActivityCard data={qv.activity} path={`${qBase}activity`}/>}
      </div>
    </div>);
}
