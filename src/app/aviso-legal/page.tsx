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
        <li><strong>Titular:</strong> STARTIDEA MALAGA SL</li>
        <li><strong>Nombre comercial:</strong> todomerchandising (iniciativa de Startidea)</li>
        <li><strong>CIF:</strong> B19583632</li>
        <li><strong>Domicilio:</strong> C/ Conde Cifuentes, 33 — 18005 Granada, España</li>
        <li><strong>Teléfono:</strong> +34 958 045 789</li>
        <li><strong>Email general:</strong> <a href="mailto:info@startidea.es">info@startidea.es</a></li>
        <li><strong>Email comercial todomerchandising:</strong> <a href="mailto:hola@merchandising.startidea.es">hola@merchandising.startidea.es</a></li>
        <li><strong>Sitio web:</strong> https://merchandising.startidea.es</li>
      </ul>

      <h2>2. Objeto</h2>
      <p>
        El presente aviso legal regula el acceso, navegación y uso del sitio web
        merchandising.startidea.es, así como las responsabilidades derivadas de la utilización
        de sus contenidos por parte de los usuarios. El sitio tiene por objeto dar a conocer
        y facilitar la contratación de servicios de merchandising corporativo personalizado
        producidos en colaboración con Centros Especiales de Empleo y talleres locales.
      </p>

      <h2>3. Condiciones de uso</h2>
      <p>
        El acceso al sitio web es libre y gratuito. El usuario se compromete a hacer un uso
        adecuado de los contenidos y servicios y a no emplearlos para realizar actividades
        ilícitas o contrarias a la buena fe. Queda expresamente prohibido cualquier intento
        de daño a los sistemas, la introducción de virus o la difusión de software malicioso.
      </p>

      <h2>4. Propiedad intelectual e industrial</h2>
      <p>
        Todos los contenidos del sitio (textos, fotografías, gráficos, logotipos, código fuente
        y diseño) son titularidad de STARTIDEA MALAGA SL o de terceros que han autorizado su
        uso. Queda prohibida cualquier reproducción, distribución o transformación sin
        autorización expresa.
      </p>

      <h2>5. Responsabilidad</h2>
      <p>
        STARTIDEA MALAGA SL no se responsabiliza de los daños o perjuicios derivados de
        interrupciones, virus informáticos, averías o desconexiones que puedan afectar al
        sistema operativo del usuario.
      </p>

      <h2>6. Protección de datos</h2>
      <p>
        El tratamiento de los datos personales que el usuario facilite a través de los
        formularios o por correo electrónico se realiza conforme a lo establecido en la{" "}
        <a href="/privacidad">Política de Privacidad</a> del sitio.
      </p>

      <h2>7. Legislación aplicable y jurisdicción</h2>
      <p>
        Este aviso legal se rige por la legislación española. Para la resolución de cualquier
        controversia, las partes se someten a los Juzgados y Tribunales del domicilio del
        consumidor cuando éste sea el demandante; en otro caso, a los Juzgados y Tribunales
        de Granada.
      </p>
    </LegalLayout>
  );
}
