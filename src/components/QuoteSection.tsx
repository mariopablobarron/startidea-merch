import { QuoteForm } from "./QuoteForm";
import { getQuoteSettings } from "@/lib/quote-settings";

export async function QuoteSection() {
  const settings = await getQuoteSettings();
  if (!settings.showOnHome) return null;

  return (
    <section id="cotizar" className="bg-bone py-24 lg:py-36">
      <div className="mx-auto max-w-8xl px-6 lg:px-10">
        <div className="grid gap-16 lg:grid-cols-[1fr,1.4fr]">
          <div>
            <p className="mb-6 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/60">
              — Cotización en 24h
            </p>
            <h2 className="font-display text-section font-semibold text-ink">
              {settings.heroTitle}
              <br />
              <span className="text-ink/50">{settings.heroSubtitle}</span>
            </h2>
            {settings.heroBullets.length > 0 && (
              <ul className="mt-10 space-y-4 text-ink/70">
                {settings.heroBullets.map((b, i) => (
                  <Bullet key={i}>{b}</Bullet>
                ))}
              </ul>
            )}
            {settings.paymentMethods.length > 0 && (
              <div className="mt-10 rounded-2xl border border-line bg-bone-soft p-5 text-sm">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/60">
                  Métodos de pago aceptados
                </p>
                <ul className="space-y-1 text-ink/70">
                  {settings.paymentMethods.map((m, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="h-1 w-1 rounded-full bg-accent" /> {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-line bg-bone-soft p-8 lg:p-12">
            <QuoteForm
              requireCompany={settings.requireCompany}
              requirePhone={settings.requirePhone}
              requireDeadline={settings.requireDeadline}
              showBudgetField={settings.showBudgetField}
              deadlineOptions={settings.deadlineOptions}
              responseHours={settings.responseHours}
              successTitle={settings.successTitle}
              successMessage={settings.successMessage}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <span>{children}</span>
    </li>
  );
}
