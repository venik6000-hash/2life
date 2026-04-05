import { useRef, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { useEditor } from "../context/EditorContext";

export default function Ed({ v, f, save, ml, fontSize, ro = false }) {
  const { $ } = useTheme();
  const { ef, ev, setEf, setEv } = useEditor();
  const editorRef = useRef(null);
  const resolvedFontSize = fontSize == null ? 13 : fontSize;

  const inp = { padding: "6px 10px", borderRadius: 6, border: `1px solid ${$.brd}`, background: $.bgI, color: $.tx, fontSize: resolvedFontSize, fontFamily: "inherit", outline: "none", width: "100%" };
  const bs = { padding: "4px 8px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" };

  useEffect(() => {
    if (ef === f && editorRef.current) {
      try { editorRef.current.focus({ preventScroll: true }); } catch (_) { editorRef.current.focus(); }
    }
  }, [ef, f]);

  if (ro) {
    return <span style={{ fontFamily: "inherit", fontSize: fontSize == null ? "inherit" : fontSize, fontWeight: "inherit", color: "inherit" }}>{v || <i style={{ color: $.txM }}>—</i>}</span>;
  }

  if (ef === f) return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {ml
        ? <textarea ref={editorRef} style={{ ...inp, minHeight: 50, resize: "vertical" }} value={ev} onChange={e => setEv(e.target.value)} />
        : <input ref={editorRef} style={inp} value={ev} onChange={e => setEv(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { save(ev); setEf(null); } }} />
      }
      <button style={{ ...bs, background: $.ac, color: "#fff" }} onClick={() => { save(ev); setEf(null); }}>OK</button>
      <button style={{ ...bs, background: "transparent", color: $.txS, border: `1px solid ${$.brd}` }} onClick={() => setEf(null)}>X</button>
    </span>
  );

  return (
    <span
      style={{ cursor: "pointer", borderBottom: `1px dashed ${$.brd}`, fontFamily: "inherit", fontSize: fontSize == null ? "inherit" : fontSize, fontWeight: "inherit", color: "inherit", display: "inline-block", maxWidth: "100%", whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: "inherit" }}
      onClick={() => { setEf(f); setEv(v ?? ""); }}
      title="Редактировать"
    >
      {v || <i style={{ color: $.txM }}>—</i>}
    </span>
  );
}
