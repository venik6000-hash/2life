import { createContext, useContext, useState } from "react";

const EditorContext = createContext(null);

export function EditorProvider({ children }) {
  const [ef, setEf] = useState(null);
  const [ev, setEv] = useState("");

  return (
    <EditorContext.Provider value={{ ef, setEf, ev, setEv }}>
      {children}
    </EditorContext.Provider>
  );
}

export const useEditor = () => useContext(EditorContext);
