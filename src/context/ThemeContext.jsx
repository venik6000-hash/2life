import { createContext, useContext, useState, useEffect } from "react";
import { TH } from "../styles/theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [dk, setDk] = useState(() => localStorage.getItem("dash_theme") === "dark");

  useEffect(() => {
    localStorage.setItem("dash_theme", dk ? "dark" : "light");
  }, [dk]);

  const $ = TH[dk ? "dark" : "light"];

  return (
    <ThemeContext.Provider value={{ dk, setDk, $ }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
