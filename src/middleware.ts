import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { hasAdminClaims, hasCustomerClaims } from "@/lib/session-claims";

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
  claimsOk: (payload: Record<string, unknown>) => boolean,
): Promise<boolean> {
  const token = req.cookies.get(cookieName)?.value;
  if (!token || !secretValue) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secretValue));
    // La firma sola NO distingue el tipo de token: mientras los tres tipos
    // caigan al mismo ADMIN_SECRET, el JWT de un cliente valida en el gate de
    // admin. Se comprueban además los claims, con el MISMO predicado que usa
    // el servidor — si el borde y el servidor no comparten criterio, acaban
    // divergiendo y el gate deja de significar nada.
    return claimsOk(payload as Record<string, unknown>);
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
      hasAdminClaims,
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
      hasCustomerClaims,
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
