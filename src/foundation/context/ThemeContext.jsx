import { createContext, useContext, useEffect, useState } from "react";

/* Theme (dark/light) — platform-wide. Default dark; persisted in localStorage.
   Light theme = warm cream main + navy sidebar + TEAMDEE-orange accent — the
   entire remap lives in index.css (`.light` re-declares Tailwind color vars),
   so components almost never need this hook. Use it only where colors are
   drawn from JS (Chart.js) — re-render the chart when `theme` changes and read
   neutrals via a CSS-var/`isLightTheme()` check at build time. */

const ThemeContext = createContext({ theme: "dark", toggle: () => {} });
const KEY = "ssb.theme";

// Applied SYNCHRONOUSLY (not in an effect): chart code reads the html class at
// render/effect time, and passive effects run child-first — an effect here would
// leave every Chart.js rebuild one theme behind. Idempotent, so safe to re-run.
const applyClass = (t) => document.documentElement.classList.toggle("light", t === "light");

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    let t = "dark";
    try { t = localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch { /* private mode */ }
    applyClass(t); // index.html bootstrap already did this pre-paint; confirm here
    return t;
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
  }, [theme]);

  const toggle = () => setTheme((t) => {
    const next = t === "dark" ? "light" : "dark";
    applyClass(next); // before any consumer re-renders/effects
    return next;
  });

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** For imperative drawing (Chart.js) — true when the light theme is active. */
export function isLightTheme() {
  return document.documentElement.classList.contains("light");
}
