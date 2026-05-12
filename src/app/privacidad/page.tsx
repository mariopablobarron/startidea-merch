import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Política de privacidad",
  robots: { index: false, follow: true },
};

export default function PrivacidadPage() {
  return (
    <LegalLayout title="Política de privacidad" updatedAt="27 de abril de 2026">
      <p>
        En cumplimiento del Reglamento (UE) 2016/679 (RGPD) y de la Ley Orgánica 3/2018, de
        Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD), se
        informa al usuario del tratamiento de sus datos personales.
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <ul>
        <li><strong>Responsable:</strong> STARTIDEA MALAGA SL</li>
        <li><strong>CIF:</strong> B19583632</li>
        <li><strong>Domicilio:</strong> C/ Conde Cifuentes, 33 — 18005 Granada, España</li>
        <li><strong>Teléfono:</strong> +34 958 045 789</li>
        <li><strong>Email general:</strong> <a href="mailto:info@startidea.es">info@startidea.es</a></li>
        <li><strong>Email para esta web:</strong> <a href="mailto:pedidos@startidea.es">pedidos@startidea.es</a></li>
      </ul>

      <h2>2. Finalidad del tratamiento</h2>
      <p>Tratamos los datos personales facilitados con las siguientes finalidades:</p>
      <ul>
        <li>Atender las solicitudes de cotización enviadas a través del formulario web.</li>
        <li>Gestionar la relación comercial y, en su caso, los pedidos derivados.</li>
        <li>Cumplir con las obligaciones legales aplicables (fiscales, contables, etc.).</li>
      </ul>
      <p>
        <strong>No</strong> se realizan envíos comerciales no solicitados, ni se ceden datos
        a terceros con fines de marketing.
      </p>

      <h2>3. Base legal</h2>
      <ul>
        <li><strong>Consentimiento</strong> del interesado al enviar el formulario.</li>
        <li><strong>Ejecución de un contrato</strong> o medidas precontractuales para la cotización y, en su caso, el pedido.</li>
        <li><strong>Cumplimiento de obligaciones legales</strong>.</li>
      </ul>

      <h2>4. Plazo de conservación</h2>
      <p>
        Los datos se conservarán durante el tiempo necesario para cumplir la finalidad para la
        que fueron recogidos y para determinar las posibles responsabilidades derivadas. En caso
        de no formalizarse pedido, los datos de cotización se conservarán durante un máximo de
        24 meses, salvo solicitud de supresión anterior.
      </p>

      <h2>5. Destinatarios</h2>
      <p>Los datos podrán comunicarse a:</p>
      <ul>
        <li>Encargados de tratamiento que prestan servicios de hosting y email transaccional bajo contrato (Coolify/VPS, Resend).</li>
        <li>Proveedores de producción (Centros Especiales de Empleo, talleres, MidOcean, Makito) únicamente cuando sea imprescindible para ejecutar un pedido.</li>
        <li>Administraciones públicas cuando exista obligación legal.</li>
      </ul>

      <h2>6. Derechos del interesado</h2>
      <p>El usuario puede ejercer los siguientes derechos:</p>
      <ul>
        <li>Acceso, rectificación y supresión de sus datos.</li>
        <li>Limitación y oposición al tratamiento.</li>
        <li>Portabilidad de los datos.</li>
        <li>Retirada del consentimiento en cualquier momento.</li>
        <li>Reclamación ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noreferrer">aepd.es</a>).</li>
      </ul>
      <p>
        Para ejercer estos derechos, puede escribirnos a{" "}
        <a href="mailto:info@startidea.es">info@startidea.es</a> indicando el derecho que desea
        ejercer y adjuntando una copia de su DNI o documento equivalente para la verificación
        de identidad.
      </p>

      <h2>7. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas razonables para proteger los datos
        personales contra accesos no autorizados, pérdida o alteración: cifrado en tránsito (HTTPS),
        acceso restringido, copias de seguridad y registros de actividad.
      </p>
    </LegalLayout>
  );
}
