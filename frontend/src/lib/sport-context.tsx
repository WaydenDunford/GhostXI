import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { sports, type SportConfig, type SportId } from "./sports";
import { getDataset, type SportDataset } from "./sport-data";

const STORAGE_KEY = "ghostxi-sport";

type SportContextValue = {
  sport: SportId;
  setSport: (id: SportId) => void;
  config: SportConfig;
  dataset: SportDataset;
};

const SportContext = createContext<SportContextValue | null>(null);
export const PresentationContext = createContext<SportDataset | null>(null);

export function SportProvider({ children }: { children: ReactNode }) {
  const [sport, setSportState] = useState<SportId>("football");

  // Read the persisted choice after hydration to avoid SSR mismatch.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in sports) setSportState(saved as SportId);
  }, []);

  const setSport = (id: SportId) => {
    setSportState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const value = useMemo<SportContextValue>(
    () => ({ sport, setSport, config: sports[sport], dataset: getDataset(sport) }),
    [sport],
  );

  return <SportContext.Provider value={value}>{children}</SportContext.Provider>;
}

export function useSport(): SportContextValue {
  const ctx = useContext(SportContext);
  const presentation = useContext(PresentationContext);
  if (!ctx) throw new Error("useSport must be used inside SportProvider");
  return presentation && ctx.sport === "football" ? { ...ctx, dataset: presentation } : ctx;
}
