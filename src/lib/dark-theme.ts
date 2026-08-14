import { useEffect, useState } from "react";

const KEY = "dark-theme";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function apply(enabled: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", enabled);
}

export function useDarkTheme() {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    const initial = read();
    setEnabled(initial);
    apply(initial);
  }, []);

  const toggle = () => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      apply(next);
      return next;
    });
  };

  return { enabled, toggle };
}