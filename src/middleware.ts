import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Gate /admin/* y /clientes/* en el edge: verifica la FIRMA del JWT de sesión
 * (HS256 vía jose), no solo su presencia — así una cookie inventada no pasa el
 * gate. Cada page repite el check completo server-side con getAdminSession. Si
 * la cookie falta o la firma no valida → redirige al login correspondiente.
 *
 * Excluye:
 *   - /admin/login y /clientes/login
 *   - /admin/api/... y /clientes/api/... (no aplica, las API viven en /api/admin/*)
 */
async function hasValidJwtCookie(
  req: NextRequest,
  cookieName: string,
  secretValue: string,
): Promise<boolean> {
  const token = req.cookies.get(cookieName)?.value;
  if (!token || !secretValue) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secretValue));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const hasSession = await hasValidJwtCookie(
      req,
      "merch_admin",
      process.env.ADMIN_JWT_SECRET || process.env.ADMIN_SECRET || "",
    );
    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/clientes") && pathname !== "/clientes/login") {
    const hasSession = await hasValidJwtCookie(
      req,
      "merch_customer",
      process.env.CUSTOMER_JWT_SECRET ||
        process.env.ADMIN_JWT_SECRET ||
        process.env.ADMIN_SECRET ||
        "",
    );
    if (!hasSession) {
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
