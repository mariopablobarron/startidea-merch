import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { findOrCreateCustomerByEmail } from "@/lib/customer-auth";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://merchandising.hubstartidea.es";

/**
 * Genera un magic link de acceso al portal de cliente para incluir en
 * el email post-pago. Crea CustomerUser si no existe (lo cual ahora sí
 * sucede porque el findOrCreate exige tener un Cart con ese email, y
 * tras pago efectivamente hay uno).
 *
 * Devuelve la URL absoluta /api/clientes/auth/consume/{token}, con
 * expiración 7 días (más larga que magic links manuales porque el cliente
 * podría revisar el email días después del pago).
 */
export async function createPostPaymentMagicLink(
  email: string,
  name?: string,
): Promise<string | null> {
  const user = await findOrCreateCustomerByEmail(email, name);
  if (!user) return null;

  const token = `cmlt_${randomBytes(20).toString("base64url")}`;
  await prisma.customerUser.update({
    where: { id: user.id },
    data: {
      magicLinkToken: token,
      // Magic link post-pago: vale 7 días. El cliente típicamente
      // revisa email de pago días después de pagar.
      magicLinkExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return `${SITE_URL}/api/clientes/auth/consume/${token}`;
}
