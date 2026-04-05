import { jColors } from "../styles/theme";
import Ed from "../components/Ed";

export default function JournalSection({ st, card, $, inp, uS, bt }) {
  const jTypes = ["Консультация", "Старт", "Созвон", "Обследование", "Заметка"];
  const jAuthors = ["2life", st.doctor || "Врач"].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div>
      {st.journal?.map((e, i) => (
        <div key={i} style={{ ...card({ marginBottom: 10 }), borderLeft: `4px solid ${jColors[e.type] || $.txM}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                value={e.type}
                onChange={ev2 => uS(s => { s.journal[i].type = ev2.target.value; })}
                style={{ ...inp, width: "auto", padding: "2px 6px", fontSize: 11, fontWeight: 600, color: jColors[e.type] || $.txM, background: $.bgI }}
              >
                {jTypes.map(jt => <option key={jt} value={jt}>{jt}</option>)}
              </select>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                <Ed v={e.date} f={`jd-${i}`} save={v => uS(s => { s.journal[i].date = v; })} />
              </span>
            </div>
            <button onClick={() => uS(s => { s.journal.splice(i, 1); })} style={{ background: "none", border: "none", cursor: "pointer", color: $.dn }}>✕</button>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <Ed v={e.text} f={`jt-${i}`} ml save={v => uS(s => { s.journal[i].text = v; })} />
          </div>
          <div style={{ fontSize: 11, color: $.txM, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
            —{" "}
            <select
              value={e.author || "2life"}
              onChange={ev2 => uS(s => { s.journal[i].author = ev2.target.value; })}
              style={{ ...inp, width: "auto", padding: "1px 4px", fontSize: 11, color: $.txM, background: "transparent", border: "none" }}
            >
              {jAuthors.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      ))}
      <button
        onClick={() => {
          const now = new Date();
          const d = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
          uS(s => { s.journal.push({ date: d, type: "Заметка", text: "", author: "2life" }); });
        }}
        style={bt()}
      >
        + Запись
      </button>
    </div>
  );
}
