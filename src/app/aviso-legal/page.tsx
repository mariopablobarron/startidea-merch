import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Aviso legal",
  robots: { index: false, follow: true },
};

export default function AvisoLegalPage() {
  return (
    <LegalLayout title="Aviso legal" updatedAt="27 de abril de 2026">
      <p>
        En cumplimiento de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la
        Información y de Comercio Electrónico (LSSI-CE), se informa a continuación de los datos
        identificativos del titular del sitio web.
      </p>

      <h2>1. Datos del titular</h2>
      <ul>
        <li><strong>Titular:</strong> [Razón social pendiente]</li>
        <li><strong>NIF / CIF:</strong> [Pendiente]</li>
        <li><strong>Domicilio social:</strong> [Pendiente]</li>
        <li><strong>Email de contacto:</strong> hola@merchandising.startidea.es</li>
        <li><strong>Sitio web:</strong> https://merchandising.startidea.es</li>
      </ul>

      <h2>2. Objeto</h2>
      <p>
        El sitio web tiene por objeto dar a conocer y facilitar la contratación de servicios
        de merchandising corporativo personalizado producidos en colaboración con Centros
        Especiales de Empleo y talleres locales.
      </p>

      <h2>3. Condiciones de uso</h2>
      <p>
        El acceso al sitio web es libre y gratuito. El usuario se compromete a hacer un uso
        adecuado de los contenidos y servicios y a no emplearlos para realizar actividades
        ilícitas o contrarias a la buena fe.
      </p>

      <h2>4. Propiedad intelectual e industrial</h2>
      <p>
        Todos los contenidos del sitio (textos, fotografías, gráficos, logotipos, código fuente
        y diseño) son titularidad del prestador o de terceros que han autorizado su uso. Queda
        prohibida su reproducción, distribución o transformación sin autorización expresa.
      </p>

      <h2>5. Responsabilidad</h2>
      <p>
        El titular no se responsabiliza de los daños o perjuicios derivados de interrupciones,
        virus informáticos, averías o desconexiones que puedan afectar al sistema operativo
        del usuario.
      </p>

      <h2>6. Legislación aplicable</h2>
      <p>
        Este aviso legal se rige por la legislación española. Para la resolución de cualquier
        controversia, las partes se someten a los Juzgados y Tribunales del domicilio del
        consumidor cuando éste sea el demandante.
      </p>
    </LegalLayout>
  );
}
