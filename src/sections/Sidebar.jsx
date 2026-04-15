import { useTheme } from "../context/ThemeContext";
import { useDashboard } from "../context/DashboardContext";
import { useAuth } from "../context/AuthContext";
import { sortClientsByName } from "../utils/clientSort";

export default function Sidebar() {
  const { $ } = useTheme();
  const {
    so, setSo, pk, setPk, cls, cl, cid, si, setSi, sec, setSec, setCid, setPri, setMd, removeStage,
    visibleSections, canCreateClient, canWriteSection, renameClientById
  } = useDashboard();
  const { user } = useAuth();

  const bt = v=>({padding:"7px 14px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,fontFamily:"inherit",background:v==="g"?"transparent":$[v]||$.ac,color:v==="g"?$.txS:"#fff",...(v==="g"?{border:`1px solid ${$.brd}`}:{}),transition:"all .15s"});
  const city = cl ? (cl.stages?.[si]?.city ?? cl.city ?? "") : "";
  const sortedClients = sortClientsByName(cls);
  const canRenameClients = user?.role === "admin";

  const handleRenameClient = (client) => {
    if (!canRenameClients) return;
    const currentName = String(client?.name || client?.shortName || "").trim();
    const nextName = prompt("Новое имя клиента:", currentName);
    if (nextName == null) return;
    const cleaned = String(nextName).trim();
    if (!cleaned) {
      alert("Имя клиента не может быть пустым");
      return;
    }
    renameClientById(client.id, cleaned);
  };

  return (
    <div style={{width:so?232:54,minWidth:so?232:54,background:$.bgC,borderRight:`1px solid ${$.brd}`,display:"flex",flexDirection:"column",transition:"all .25s",overflow:"hidden",flexShrink:0}}>
      <div style={{padding:so?"14px 16px":"14px 8px",borderBottom:`1px solid ${$.brd}`,display:"flex",alignItems:"center",justifyContent:so?"space-between":"center"}}>
        {so&&<span style={{fontWeight:800,fontSize:17,color:$.ac}}>2life</span>}
        <button onClick={()=>setSo(!so)} style={{background:"none",border:"none",color:$.txS,cursor:"pointer",fontSize:16}}>{so?"◀":"▶"}</button>
      </div>
      <div style={{padding:so?"10px 14px":"10px 6px",borderBottom:`1px solid ${$.brd}`}}>
        <div onClick={()=>setPk(!pk)} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:7,borderRadius:7,background:$.bgI}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${cl.color},${cl.color}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>{cl.avatar}</div>
          {so&&<div style={{flex:1,overflow:"hidden"}}><div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cl.shortName}</div><div style={{fontSize:10,color:$.txM}}>{city||"—"}</div></div>}
        </div>
        {pk&&so&&<div style={{marginTop:6,background:$.bgC,border:`1px solid ${$.brd}`,borderRadius:7,overflow:"hidden",boxShadow:$.sh}}>
          {sortedClients.map(c=><div key={c.id} onClick={()=>{setCid(c.id);setSi(0);setPk(false);setSec("overview");setPri(0)}} style={{padding:"8px 10px",display:"flex",alignItems:"center",gap:8,cursor:"pointer",background:c.id===cid?$.acD:"transparent",borderBottom:`1px solid ${$.brd}`,fontSize:12}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:`linear-gradient(135deg,${c.color},${c.color}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff"}}>{c.avatar}</div>
            <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.shortName || c.name}</span>
            {canRenameClients && <button onClick={e=>{e.stopPropagation();handleRenameClient(c)}} title="Переименовать клиента" style={{background:"none",border:"none",cursor:"pointer",color:$.txM,fontSize:12,padding:"2px 4px",lineHeight:1}}>✎</button>}
          </div>)}
          {canCreateClient && (
            <div onClick={()=>{setMd("newCl");setPk(false)}} style={{padding:"8px 10px",cursor:"pointer",color:$.ac,fontSize:12,fontWeight:600}}>+ Новый клиент</div>
          )}
        </div>}
      </div>
      {so&&<div style={{padding:"10px 14px",borderBottom:`1px solid ${$.brd}`}}>
        <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:.8,color:$.txM,marginBottom:6}}>Этапы</div>
        {cl.stages.map((s,i)=><div key={s.id} onClick={()=>{setSi(i);setPri(0)}} style={{padding:"7px 8px",borderRadius:7,cursor:"pointer",marginBottom:3,fontSize:12,background:i===si?$.acD:"transparent",color:i===si?$.ac:$.txS,fontWeight:i===si?600:400,display:"flex",gap:7,alignItems:"center"}}>
          <span style={{width:20,height:20,borderRadius:"50%",background:i===si?$.ac:$.brd,color:i===si?"#fff":$.txM,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0}}>{s.id}</span>
          <div style={{overflow:"hidden",flex:1}}>
            <div style={{whiteSpace:"nowrap",textOverflow:"ellipsis",overflow:"hidden"}}>{s.title}</div>
            <div style={{fontSize:10,color:$.txM}}>{s.doctor||"Врач?"}</div>
          </div>
          {canWriteSection("overview") && (
            <button onClick={(e)=>{e.stopPropagation();removeStage(i)}} title="Удалить этап" style={{background:"none",border:"none",color:$.dn,cursor:"pointer",fontSize:11,padding:"2px 4px",lineHeight:1,flexShrink:0}}>✕</button>
          )}
        </div>)}
        {canWriteSection("overview") && <button onClick={()=>setMd("newSt")} style={{...bt("g"),width:"100%",marginTop:4,fontSize:11}}>+ Новый этап</button>}
      </div>}
      <div style={{flex:1,padding:so?"10px 14px":"10px 6px",overflow:"auto"}}>
        {visibleSections.map(s=><div key={s.id} onClick={()=>setSec(s.id)} style={{padding:so?"9px 10px":"9px 4px",borderRadius:7,cursor:"pointer",marginBottom:2,display:"flex",alignItems:"center",gap:8,fontSize:13,background:sec===s.id?$.acD:"transparent",color:sec===s.id?$.ac:$.txS,fontWeight:sec===s.id?600:400,justifyContent:so?"flex-start":"center"}}><span style={{fontSize:15}}>{s.ic}</span>{so&&s.lb}</div>)}
      </div>
      {user?.role === 'admin' && (
        <div style={{borderTop:`1px solid ${$.brd}`, padding: so ? "8px 14px" : "8px 6px"}}>
          <div
            onClick={() => setSec("admin")}
            style={{
              padding: so ? "9px 10px" : "9px 4px", borderRadius: 7, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8, fontSize: 13,
              background: sec === "admin" ? $.acD : "transparent",
              color: sec === "admin" ? $.ac : $.txM,
              fontWeight: sec === "admin" ? 600 : 400,
              justifyContent: so ? "flex-start" : "center"
            }}
          >
            <span style={{fontSize: 15}}>⚙️</span>
            {so && "Admin"}
          </div>
        </div>
      )}
    </div>
  );
}
