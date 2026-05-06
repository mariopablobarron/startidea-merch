import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setAdminSession, isAdmin, checkAdminSecret } from "@/lib/admin-session";

export const metadata: Metadata = {
  title: "Acceso admin",
  robots: { index: false, follow: false },
};

async function loginAction(formData: FormData) {
  "use server";
  const secret = String(formData.get("secret") || "");
  if (!checkAdminSecret(secret)) {
    redirect("/admin/login?error=1");
  }
  await setAdminSession();
  redirect("/admin/quotes");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAdmin()) redirect("/admin/quotes");
  const { error } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-bone px-6">
      <form
        action={loginAction}
        className="w-full max-w-sm rounded-3xl border border-line bg-bone-soft p-8"
      >
        <h1 className="font-display text-2xl font-semibold text-ink">Acceso admin</h1>
        <p className="mt-2 text-sm text-ink/60">
          Introduce el ADMIN_SECRET para gestionar cotizaciones.
        </p>
        <label className="mt-6 grid gap-2">
          <span className="text-sm font-medium">Secret</span>
          <input
            type="password"
            name="secret"
            required
            autoFocus
            autoComplete="current-password"
            className="rounded-2xl border border-line bg-bone px-4 py-3 text-base outline-none transition focus:border-accent"
          />
        </label>
        {error && <p className="mt-3 text-sm text-accent-deep">⚠ Secret incorrecto</p>}
        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-ink py-3 text-sm font-medium text-bone transition hover:bg-accent"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
