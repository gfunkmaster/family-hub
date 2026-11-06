import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="wrap">
      <div className="login card">
        <h1>Familjeaktiviteter</h1>
        <LoginForm next={next && next.startsWith("/") ? next : "/"} />
      </div>
    </main>
  );
}
