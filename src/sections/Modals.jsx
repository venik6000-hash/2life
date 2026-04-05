export default function ModalsSection({
  md,
  setMd,
  $, 
  inp,
  bt,
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
  const Mdl=({ch,cl:cls})=><div onClick={cls} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,backdropFilter:"blur(3px)"}}><div onClick={e=>e.stopPropagation()} style={{background:$.bgC,border:`1px solid ${$.brd}`,borderRadius:14,padding:28,maxWidth:540,width:"92%",maxHeight:"80vh",overflow:"auto",boxShadow:$.sh}}>{ch}</div></div>;

  const mds={
    sh:()=><Mdl cl={()=>setMd(null)} ch={<div><h3 style={{margin:"0 0 14px",fontSize:16,fontWeight:700}}>🔗 Доступ для врача</h3><p style={{fontSize:13,color:$.txS,lineHeight:1.6}}>После деплоя врач получает ссылку — работает в браузере без ПО.</p><div style={{background:$.bgI,borderRadius:7,padding:10,margin:"12px 0",fontSize:12}}>🌐 Ссылка | 🔒 Пароль (опц.) | 👁 Просмотр | ✏️ Полный</div><div style={{display:"flex",gap:6}}><input style={{...inp,flex:1}} readOnly value={`https://app.2life.health/${cl.id}`}/><button style={bt()} onClick={()=>navigator.clipboard?.writeText(`https://app.2life.health/${cl.id}`)}>📋</button></div><button onClick={()=>setMd(null)} style={{...bt("g"),marginTop:14,width:"100%"}}>Закрыть</button></div>}/>,
    df:()=><Mdl cl={()=>setMd(null)} ch={<div><h3 style={{margin:"0 0 14px",fontSize:16,fontWeight:700}}>📖 Формат данных</h3><div style={{fontSize:13,lineHeight:1.7,color:$.txS}}><p>Данные из карт клиентов (Sheets/Excel/PDF). Структура:</p><div style={{background:$.bgI,borderRadius:7,padding:14,margin:"10px 0",fontSize:12,fontFamily:"monospace"}}><div style={{color:$.ac}}>Профиль:</div><div>ФИО | ДР | Email | Телефон | Город | Рост | Вес</div><div style={{color:$.ac,marginTop:6}}>Этап (+ врач):</div><div>Задачи | Синдромы | Дефициты | Питание | Протокол</div><div style={{color:$.ac,marginTop:6}}>Анализы (как в PDF):</div><div>Категория → Показатель | Норма | Оптимум | Дата1 | Дата2...</div><div style={{color:$.ac,marginTop:6}}>Протокол — версионность:</div><div>Каждая корректировка сохраняется как отдельная версия</div></div><p>Кликайте на <span style={{borderBottom:`1px dashed ${$.ac}`}}>подчёркнутые</span> для редактирования.</p></div><button onClick={()=>setMd(null)} style={{...bt("g"),marginTop:14,width:"100%"}}>Закрыть</button></div>}/>,
    newCl:()=><Mdl cl={()=>setMd(null)} ch={<div><h3 style={{margin:"0 0 14px",fontSize:16,fontWeight:700}}>+ Новый клиент</h3><div style={{marginBottom:10}}><label style={{fontSize:11,color:$.txS}}>ФИО</label><input style={inp} id="nc-ФИО"/></div><button onClick={()=>{const name=(document.getElementById("nc-ФИО")?.value||"").trim();if(!name)return alert("Введите ФИО");createClient({name})}} style={{...bt(),width:"100%",padding:10}}>Создать</button></div>}/>,
    newSt:()=><Mdl cl={()=>setMd(null)} ch={<div>
      <h3 style={{margin:"0 0 14px",fontSize:16,fontWeight:700}}>+ Новый этап</h3>
      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:$.txS}}>Название этапа</label>
        <input style={{...inp,marginTop:4}} value={stageAutoTitle((cl.stages?.length||0)+1)} readOnly />
      </div>
      <div style={{marginBottom:10}}>
        <label style={{fontSize:11,color:$.txS}}>Врач</label>
        <select style={{...inp,marginTop:4}} id="ns-Врач">
          <option value="">— выбрать врача этапа —</option>
          {doctors.filter(d=>d?.name).map((d,i)=><option key={`${d.name}-${i}`} value={d.name}>{d.name}{d.role?` — ${d.role}`:""}</option>)}
        </select>
      </div>
      <div style={{marginBottom:12}}>
        <label style={{fontSize:11,color:$.txS}}>Дата создания этапа</label>
        <input style={{...inp,marginTop:4}} value={todayLabel()} readOnly />
      </div>
      <button onClick={()=>{
        const curQ=JSON.parse(JSON.stringify(st.questionnaire||{}));
        const selectedDoctor=document.getElementById("ns-Врач")?.value||"";
        const docMeta=doctors.find(d=>d.name===selectedDoctor);
        const createdAt=todayLabel();
        uC(c=>{
          c.stages.forEach(s=>{s.status="completed"});
          const nextNo=c.stages.length+1;
          const prev = c.stages[c.stages.length - 1] || {};
          c.stages.push({id:nextNo,title:stageAutoTitle(nextNo),subtitle:"",doctor:selectedDoctor,doctorRole:docMeta?.role||"",dateStart:createdAt,dateEnd:"",status:"active",email:prev.email??"",phone:prev.phone??"",city:prev.city??"",height:prev.height??"",weightCurrent:prev.weightCurrent??"",weightGoal:prev.weightGoal??"",bmi:prev.bmi??"",waist:prev.waist??"",tasks:[],syndromes:[],diagnoses:[],deficits:[],nutrition:{generalRules:[],categories:[],instructions:[]},nutritionRevisions:[{id:1,date:createdAt,label:"Стартовый",comment:"",generalRules:[],categories:[],instructions:[]}],protocolRevisions:[{id:1,date:"",label:"Стартовый",groups:[]}],injections:null,analyticsCategories:[],journal:[],questionnaire:curQ});
          return c
        });
        setSi(cl.stages.length);
        setPri(0);
        setMd(null)
      }} style={{...bt(),width:"100%",padding:10}}>Создать этап</button>
    </div>}/>
    ,docAssign:()=><Mdl cl={()=>setMd(null)} ch={<div>
      <h3 style={{margin:"0 0 14px",fontSize:16,fontWeight:700}}>👨‍⚕️ Врач этапа</h3>
      <div style={{fontSize:12,color:$.txS,marginBottom:10}}>Выберите врача для текущего этапа. Управление списком врачей доступно в админ-панели.</div>
      <div style={{display:"grid",gap:10}}>
        <div>
          <label style={{fontSize:11,color:$.txS}}>Текущий врач</label>
          <select
            value={st.doctor||""}
            onChange={e=>{
              const name=e.target.value;
              const doc=doctors.find(d=>d.name===name);
              uS(s=>{s.doctor=name;s.doctorRole=doc?.role||""});
            }}
            style={{...inp,marginTop:4}}
          >
            <option value="">— выбрать врача этапа —</option>
            {doctors.filter(d=>d?.name).map((d,i)=><option key={`${d.name}-${i}`} value={d.name}>{d.name}{d.role?` — ${d.role}`:""}</option>)}
          </select>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {st.doctor&&<button onClick={()=>{uS(s=>{s.doctor="";s.doctorRole=""});setMd(null)}} style={{...bt("g"),padding:"9px 14px",color:$.dn,borderColor:$.dn}}>Снять врача</button>}
          <button onClick={()=>setMd(null)} style={{...bt("g"),padding:"9px 14px"}}>Закрыть</button>
        </div>
      </div>
    </div>}/>
    ,docs:()=><Mdl cl={()=>setMd(null)} ch={<div><h3 style={{margin:"0 0 14px",fontSize:16,fontWeight:700}}>👨‍⚕️ Врачи этапов</h3><div style={{display:"grid",gap:10}}>{doctors.map((doc,i)=><div key={i} style={{background:$.bgI,border:`1px solid ${$.brd}`,borderRadius:8,padding:10}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8,alignItems:"center"}}><input style={inp} defaultValue={doc.name||""} placeholder="Имя врача" onBlur={e=>setDoctors(p=>p.map((x,ix)=>ix===i?{...x,name:e.target.value}:x))}/><input style={inp} defaultValue={doc.role||""} placeholder="Специализация" onBlur={e=>setDoctors(p=>p.map((x,ix)=>ix===i?{...x,role:e.target.value}:x))}/><button onClick={()=>{const oldName=doctors[i]?.name||"";setDoctors(p=>p.filter((_,ix)=>ix!==i));if(oldName){setCls(prev=>prev.map(client=>({...client,stages:(client.stages||[]).map(stage=>stage.doctor===oldName?{...stage,doctor:"",doctorRole:""}:stage)})))}}} style={{...bt("g"),color:$.dn,borderColor:$.dn,fontSize:11,padding:"6px 10px"}}>Удалить</button></div></div>)}</div><button onClick={()=>setDoctors(p=>[...p,{name:"",role:""}])} style={{...bt("g"),marginTop:12,fontSize:11}}>+ Врач</button><button onClick={()=>{const prevDoctors=doctors;const cleaned=doctors.filter(d=>d.name||d.role);setCls(prev=>prev.map(client=>({...client,stages:(client.stages||[]).map(stage=>{const prevDoc=prevDoctors.find(d=>d.name===stage.doctor);if(!prevDoc)return stage;const nextDoc=cleaned.find(d=>d.name===prevDoc.name)||cleaned.find(d=>d.role===prevDoc.role&&d.name)||prevDoc;return {...stage,doctor:nextDoc.name||stage.doctor,doctorRole:nextDoc.role||stage.doctorRole||""};})})));setDoctors(cleaned);setMd(null)}} style={{...bt(),width:"100%",padding:10,marginTop:14}}>Сохранить список врачей</button></div>}/>
  };

  return md && mds[md]?.();
}
