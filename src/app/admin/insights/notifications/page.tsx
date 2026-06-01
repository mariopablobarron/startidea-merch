import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { AdminChrome } from "@/components/AdminChrome";
import { getNotificationRules } from "@/lib/notification-rules";
import { getSlackWebhookUrl } from "@/lib/slack-webhook";
import { NotificationsClient } from "./NotificationsClient";

export const metadata: Metadata = {
  title: "Reglas de notificación · Insights",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const [rules, slackUrl] = await Promise.all([
    getNotificationRules(),
    getSlackWebhookUrl(),
  ]);
  return (
    <AdminChrome>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <nav className="mb-2 flex items-center gap-2 text-xs text-ink/50">
          <Link href="/admin" className="hover:text-accent">
            Panel
          </Link>
          <span>/</span>
          <Link href="/admin/insights" className="hover:text-accent">
            Insights
          </Link>
          <span>/</span>
          <span>Notificaciones</span>
        </nav>
        <h1 className="font-display text-3xl font-semibold text-ink">
          Reglas de notificación
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Decide qué eventos disparan push a tu navegador admin y/o tu canal
          Slack/Discord. Los cambios se aplican en &lt;1 minuto.
        </p>
        <NotificationsClient initial={rules} initialSlackUrl={slackUrl ?? ""} />
      </div>
    </AdminChrome>
  );
}
