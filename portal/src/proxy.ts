import { NextResponse, type NextRequest } from "next/server";

// Quick cookie check only; real session validation happens in requireUser() on each admin page.
export function proxy(req: NextRequest) {
  if (!req.cookies.get("portal_session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
