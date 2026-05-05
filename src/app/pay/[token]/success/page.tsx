import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Pago confirmado",
  robots: { index: false, follow: false },
};

export default async function PaySuccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Redirige a la página principal del token, donde se mostrará el pago confirmado
  // (el webhook actualiza la DB; refresco vuelve a leer estado).
  redirect(`/pay/${token}`);
}
