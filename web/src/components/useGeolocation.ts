"use client";

import { useCallback, useState } from "react";

export type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; lat: number; lng: number; accuracy: number }
  | { status: "error"; message: string };

const MESSAGES: Record<number, string> = {
  1: "Du nekade platsåtkomst. Tillåt platsen för sidan i webbläsarens inställningar.",
  2: "Positionen gick inte att få fram just nu.",
  3: "Det tog för lång tid att hitta positionen.",
};

/** Telefonens position, bara när användaren trycker på knappen. */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle" });
  const request = useCallback(() => {
    if (!("geolocation" in navigator)) { setState({ status: "error", message: "Webbläsaren kan inte ge position." }); return; }
    setState({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (p) => setState({ status: "ok", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => setState({ status: "error", message: MESSAGES[e.code] ?? "Positionen gick inte att få fram." }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, []);
  return { state, request };
}
