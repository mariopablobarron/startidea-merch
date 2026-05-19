import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Política de cookies",
  robots: { index: false, follow: true },
};

export default function CookiesPage() {
  return (
    <LegalLayout title="Política de cookies" updatedAt="18 de mayo de 2026">
      <h2>1. ¿Qué son las cookies?</h2>
      <p>
        Las cookies son pequeños archivos que se descargan en el dispositivo del usuario al
        acceder a determinadas páginas web. Permiten almacenar y recuperar información sobre
        los hábitos de navegación.
      </p>

      <h2>2. Cookies utilizadas en este sitio</h2>
      <p>
        En este sitio empleamos dos categorías de cookies, regidas por la guía sobre el uso
        de cookies de la AEPD (2024) y el Reglamento (UE) 2016/679 (RGPD).
      </p>

      <h3>2.1 Cookies técnicas y de personalización (exentas de consentimiento)</h3>
      <p>
        Necesarias para el funcionamiento del sitio. No requieren consentimiento previo
        conforme al art. 22.2 de la LSSI-CE.
      </p>
      <ul>
        <li>
          <strong>Sesión y autenticación</strong>: mantienen el estado del usuario durante la
          navegación (incluido acceso al portal cliente y administración). Se eliminan al
          cerrar el navegador o cuando expira la sesión.
        </li>
        <li>
          <strong>Carrito de cotización</strong>: <code>merch:cart</code> en localStorage,
          guarda los productos añadidos al carrito hasta que el usuario lo envía o lo borra.
        </li>
        <li>
          <strong>Seguridad CSRF</strong>: protección frente a falsificación de petición en
          formularios y pagos.
        </li>
        <li>
          <strong>Preferencia de consentimiento</strong>:{" "}
          <code>merch:cookie-consent:v1</code>, recuerda tu elección sobre las cookies
          opcionales para no volver a mostrar el banner.
        </li>
      </ul>

      <h3>2.2 Cookies de análisis (requieren consentimiento previo)</h3>
      <p>
        Solo se activan si el usuario las acepta explícitamente desde el banner de
        consentimiento. Hasta entonces permanecen <strong>denegadas por defecto</strong>
        (Google Consent Mode v2).
      </p>
      <ul>
        <li>
          <strong>Google Analytics 4</strong> (proveedor: Google Ireland Limited). Cookies{" "}
          <code>_ga</code>, <code>_ga_*</code>. Finalidad: medir tráfico agregado y
          comportamiento del sitio para mejorar la experiencia. Conservación: 14 meses
          (configurado en GA4). Más información:{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer noopener">
            política de privacidad de Google
          </a>
          .
        </li>
      </ul>

      <h3>2.3 Cookies de terceros activadas al usar funcionalidades específicas</h3>
      <p>
        Estas cookies solo se cargan cuando el usuario interactúa con una funcionalidad
        externa del sitio.
      </p>
      <ul>
        <li>
          <strong>Stripe</strong> (proveedor: Stripe Payments Europe Ltd.). Al pulsar
          &quot;Pagar&quot; o usar el checkout con tarjeta. Necesario para prevención de
          fraude y cumplimiento PCI-DSS. Más info:{" "}
          <a href="https://stripe.com/es/privacy" target="_blank" rel="noreferrer noopener">
            política de Stripe
          </a>
          .
        </li>
        <li>
          <strong>ElevenLabs Conversational AI</strong> (proveedor: ElevenLabs Inc.). Solo se
          activa cuando el usuario pulsa &quot;Hablar con Carmen&quot; y autoriza el
          micrófono. La voz se procesa en tiempo real y no se almacena de forma persistente
          por nosotros. Más info:{" "}
          <a href="https://elevenlabs.io/privacy" target="_blank" rel="noreferrer noopener">
            política de ElevenLabs
          </a>
          .
        </li>
      </ul>

      <h2>3. Gestión y revocación del consentimiento</h2>
      <p>
        Puedes <strong>revocar o cambiar tu consentimiento</strong> en cualquier momento
        borrando la cookie <code>merch:cookie-consent:v1</code> desde tu navegador o
        eliminando los datos del sitio. Al volver a entrar, te mostraremos de nuevo el
        banner de cookies para que elijas.
      </p>
      <p>
        También puedes bloquear o eliminar las cookies desde la configuración de tu
        navegador (Chrome, Firefox, Safari, Edge…). Ten en cuenta que bloquear las cookies
        técnicas puede afectar al funcionamiento del sitio.
      </p>

      <h2>4. Transferencias internacionales</h2>
      <p>
        Google (GA4), Stripe y ElevenLabs son proveedores con presencia en Estados Unidos.
        Las transferencias se realizan al amparo de las cláusulas contractuales tipo
        aprobadas por la Comisión Europea y, en su caso, del Data Privacy Framework
        UE–EE.UU. Más detalle en la{" "}
        <a href="/privacidad">Política de privacidad</a>.
      </p>

      <h2>5. Cambios en la política</h2>
      <p>
        Esta política puede ser actualizada para reflejar cambios en la legislación o en
        las herramientas que utilizamos. Recomendamos revisarla periódicamente. La fecha
        de la última actualización figura arriba.
      </p>
    </LegalLayout>
  );
}
