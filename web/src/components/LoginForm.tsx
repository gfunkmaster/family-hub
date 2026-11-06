"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="login">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="password">Familjens lösenord
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error ? <p className="error" role="alert">{state.error}</p> : null}
      <button className="primary" type="submit" disabled={pending}>{pending ? "Loggar in…" : "Logga in"}</button>
    </form>
  );
}
