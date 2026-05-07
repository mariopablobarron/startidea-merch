import { NextRequest, NextResponse } from "next/server";

/**
 * Gate /admin/* y /clientes/* tras cookie.
 * No verifica firma JWT (eso lo hace cada page server-side con getAdminSession),
 * sólo presencia de cookie. Si no hay cookie → redirige al login correspondiente.
 *
 * Excluye:
 *   - /admin/login y /clientes/login
 *   - /admin/api/... y /clientes/api/... (no aplica, las API viven en /api/admin/*)
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const hasCookie = req.cookies.has("merch_admin");
    if (!hasCookie) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/clientes") && pathname !== "/clientes/login") {
    const hasCookie = req.cookies.has("merch_customer");
    if (!hasCookie) {
      const url = req.nextUrl.clone();
      url.pathname = "/clientes/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/clientes/:path*"],
};
