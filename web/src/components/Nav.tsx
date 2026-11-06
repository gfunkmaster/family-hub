import Link from "next/link";
import { logout } from "@/app/actions";

export function Nav({ current }: { current: "forslag" | "bestall" | "plan" }) {
  return (
    <>
      <header className="top">
        <div className="row between">
          <h1>Familjeaktiviteter</h1>
          <form action={logout}><button className="small" type="submit">Logga ut</button></form>
        </div>
      </header>
      <nav className="tabs" aria-label="Vyer">
        <Link href="/" aria-current={current === "forslag" ? "page" : undefined}>Förslag</Link>
        <Link href="/bestall" aria-current={current === "bestall" ? "page" : undefined}>Beställ</Link>
      </nav>
    </>
  );
}
