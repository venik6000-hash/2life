import { useTheme } from "../context/ThemeContext";
import { useDashboard } from "../context/DashboardContext";
import Badge from "../components/Badge";
import Ed from "../components/Ed";

export default function Header({ pdf }) {
  const { $, dk, setDk } = useTheme();
  const { sec, cl, st, updateClientName, removeClient, canDeleteClient, canWriteSection } = useDashboard();

  const bt = v=>({padding:"7px 14px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,fontFamily:"inherit",background:v==="g"?"transparent":$[v]||$.ac,color:v==="g"?$.txS:"#fff",...(v==="g"?{border:`1px solid ${$.brd}`}:{}),transition:"all .15s"});

  return (
    <div style={{padding:"10px 20px",borderBottom:`1px solid ${$.brd}`,background:$.bgC,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,gap:12}}>
      <div><h2 style={{margin:0,fontSize:16,fontWeight:700}}>{sec==="overview"?<Ed v={cl.name} f={`client-name-${cl.id}`} save={updateClientName} ro={!canWriteSection("overview")}/>:cl.name}</h2><div style={{fontSize:11,color:$.txM,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:2}}>Этап {st.id}: {st.title}{st.doctor&&<Badge c="pu" ch={`👨‍⚕️ ${st.doctor}${st.doctorRole?` • ${st.doctorRole}`:""}`}/>}{st.status==="active"&&<Badge c="ac" ch="Активный"/>}</div></div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        <button onClick={pdf} style={bt("g")}>📄 PDF</button>
        {canDeleteClient && <button onClick={removeClient} style={{...bt("g"),color:$.dn,borderColor:$.dn}} title="Удалить клиента">🗑</button>}
        <button onClick={()=>setDk(!dk)} style={{...bt("g"),fontSize:16,padding:"5px 8px"}}>{dk?"☀️":"🌙"}</button>
      </div>
    </div>
  );
}
