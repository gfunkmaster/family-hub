"use client";

import { useCallback, useState } from "react";

export type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; lat: number; lng: number; accuracy: number; address: string | null | undefined }
  | { status: "error"; message: string };

const MESSAGES: Record<number, string> = {
  1: "Du nekade platsåtkomst. Tillåt platsen för sidan i webbläsarens inställningar.",
  2: "Positionen gick inte att få fram just nu.",
  3: "Det tog för lång tid att hitta positionen.",
};

/** Telefonens position, bara när användaren trycker på knappen. */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle" });
  /** Ber om positionen. Löftet ger samma resultat som `state`, för den som vill agera på svaret. */
  const request = useCallback((): Promise<GeoState> => new Promise((resolve) => {
    const done = (s: GeoState) => { setState(s); resolve(s); };
    if (!("geolocation" in navigator)) { done({ status: "error", message: "Webbläsaren kan inte ge position." }); return; }
    setState({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lng, accuracy } = p.coords;
        done({ status: "ok", lat, lng, accuracy, address: undefined });
        // Adressen kommer efter positionen. Misslyckas den visas positionen som förut.
        fetch(`/api/reverse?lat=${lat}&lng=${lng}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ address: string | null }>) : Promise.reject(new Error())))
          .then((b) => setState((cur) => (cur.status === "ok" && cur.lat === lat && cur.lng === lng ? { ...cur, address: b.address } : cur)))
          .catch(() => setState((cur) => (cur.status === "ok" && cur.lat === lat && cur.lng === lng ? { ...cur, address: null } : cur)));
      },
      (e) => done({ status: "error", message: MESSAGES[e.code] ?? "Positionen gick inte att få fram." }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }), []);
  return { state, request };
}
