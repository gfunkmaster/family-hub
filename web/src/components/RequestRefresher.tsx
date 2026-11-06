"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Laddar om sidan var 10:e sekund medan en direktsökning pågår. */
export function RequestRefresher({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
