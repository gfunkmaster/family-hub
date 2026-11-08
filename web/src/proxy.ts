import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Allt utom inloggningen och agentens API kräver familjens inloggning.
// Agentens API (/api/agent/*) skyddas av en Bearer-token i varje route.
export async function proxy(req: NextRequest) {
  const secret = process.env.SESSION_SECRET ?? "";
  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret);
  if (ok) return NextResponse.next();
  const url = new URL("/login", req.nextUrl);
  if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/agent|api/health|_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|apple-icon.png|manifest.webmanifest).*)"],
};
