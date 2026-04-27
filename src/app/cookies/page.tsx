import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Política de cookies",
  robots: { index: false, follow: true },
};

export default function CookiesPage() {
  return (
    <LegalLayout title="Política de cookies" updatedAt="27 de abril de 2026">
      <h2>1. ¿Qué son las cookies?</h2>
      <p>
        Las cookies son pequeños archivos que se descargan en el dispositivo del usuario al
        acceder a determinadas páginas web. Permiten almacenar y recuperar información sobre
        los hábitos de navegación.
      </p>

      <h2>2. Cookies utilizadas en este sitio</h2>
      <p>
        Actualmente este sitio <strong>no utiliza cookies de seguimiento, publicidad ni
        analítica de terceros</strong>. Únicamente se emplean cookies técnicas estrictamente
        necesarias para el funcionamiento del sitio (sesión, balanceo de carga, preferencias
        de idioma) cuando aplique.
      </p>

      <h2>3. Cookies técnicas (exentas de consentimiento)</h2>
      <ul>
        <li><strong>Sesión:</strong> mantienen el estado del usuario durante la navegación. Se eliminan al cerrar el navegador.</li>
        <li><strong>Seguridad:</strong> protección frente a CSRF y similares cuando aplique.</li>
      </ul>

      <h2>4. Configuración y desactivación</h2>
      <p>
        Puede gestionar y/o desactivar las cookies desde la configuración de su navegador. Si
        en el futuro se incorporan cookies analíticas o de marketing, se solicitará
        previamente su consentimiento informado mediante un banner conforme al RGPD y la guía
        de la AEPD.
      </p>

      <h2>5. Cambios en la política</h2>
      <p>
        Esta política puede ser actualizada para reflejar cambios en la legislación o en el
        funcionamiento del sitio. Recomendamos revisarla periódicamente.
      </p>
    </LegalLayout>
  );
}
