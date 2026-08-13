import type { Metadata } from "next";
import { LegalLayout } from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "Política de privacidad",
  robots: { index: false, follow: true },
};

export default function PrivacidadPage() {
  return (
    <LegalLayout title="Política de privacidad" updatedAt="8 de agosto de 2026">
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
        <li>Atender las solicitudes de cotización enviadas a través del formulario web, del agente de voz o de la API.</li>
        <li>Gestionar la relación comercial y, en su caso, los pedidos derivados (incluida pasarela de pago, generación de facturas y envío de tracking).</li>
        <li>Enviar comunicaciones transaccionales relacionadas con tu cotización o pedido (confirmaciones, recordatorios de carrito abandonado, certificados RSC, invitación a valorar el pedido).</li>
        <li>Medir uso agregado del sitio para mejorar producto y SEO (solo si aceptas cookies analíticas).</li>
        <li>Medir y atribuir el rendimiento de campañas publicitarias (solo si aceptas cookies de marketing).</li>
        <li>Cumplir con las obligaciones legales aplicables (fiscales, contables, mercantiles).</li>
      </ul>
      <p>
        <strong>No</strong> se realizan envíos comerciales no solicitados, ni se ceden datos
        a terceros con fines de marketing. Tampoco se elaboran perfiles automatizados con
        efectos jurídicos significativos.
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

      <h2>5. Destinatarios y encargados de tratamiento</h2>
      <p>
        Los datos podrán comunicarse a los siguientes encargados de tratamiento, todos
        ellos contratados bajo acuerdo de tratamiento de datos (DPA) conforme al art. 28
        del RGPD:
      </p>
      <ul>
        <li>
          <strong>Hostinger</strong> (Hostinger International Ltd., Lituania) — hosting de
          la base de datos y servidor en VPS en territorio UE.
        </li>
        <li>
          <strong>Resend</strong> (Resend Inc., EE.UU.) — envío de emails transaccionales
          (confirmaciones de cotización y pedido, drips post-pedido, certificados RSC).
          Datos transmitidos: email, nombre, contenido del pedido. Transferencia
          internacional al amparo de Cláusulas Contractuales Tipo de la Comisión Europea.
        </li>
        <li>
          <strong>Stripe</strong> (Stripe Payments Europe Ltd., Irlanda) — procesamiento
          de pagos con tarjeta. Datos transmitidos al hacer un pedido: importe, email,
          dirección de facturación, datos de tarjeta (que <em>nosotros nunca recibimos —
          van directos a Stripe</em>). Stripe es responsable independiente para la
          prevención del fraude y el cumplimiento PCI-DSS.
        </li>
        <li>
          <strong>ElevenLabs</strong> (ElevenLabs Inc., EE.UU.) — agente de voz
          conversacional &quot;Carmen&quot;. Solo se activa cuando autorizas el micrófono
          al pulsar &quot;Hablar con Carmen&quot;. Tu voz se transmite en tiempo real
          para reconocimiento y respuesta, no se almacena permanentemente por nosotros.
          La conversación transcrita se guarda en nuestra base de datos para diagnóstico
          interno (máx 90 días).
        </li>
        <li>
          <strong>OpenAI</strong> y/o <strong>OpenRouter</strong> (EE.UU.) — generación de
          embeddings semánticos para mejorar la búsqueda del catálogo. Solo se transmiten
          descripciones del catálogo y, en su caso, el texto de la consulta del usuario.
          No se transmiten datos personales de cuenta cliente.
        </li>
        <li>
          <strong>Telegram</strong> (Telegram FZ-LLC) — alertas internas al equipo cuando
          ocurre un evento crítico (pago confirmado, error de envío, lead nuevo).
          Contenido: id de cotización, nombre del cliente, importe.
        </li>
        <li>
          <strong>Google Analytics 4</strong> (Google Ireland Ltd.) — solo si aceptas
          cookies analíticas en el banner. Datos: visitas agregadas, recorrido por la
          web, tiempo en página. Sin perfilado individual.
        </li>
        <li>
          <strong>Spotify</strong> — solo si aceptas cookies de marketing en el banner.
          Spotify Pixel procesa datos de navegación y eventos de conversión para medir y
          atribuir el rendimiento de campañas publicitarias.
        </li>
        <li>
          <strong>Proveedores de producción</strong>: Centros Especiales de Empleo,
          talleres locales y mayoristas europeos certificados, únicamente
          cuando sea imprescindible para ejecutar un pedido. Datos compartidos:
          referencia, cantidad, marcaje, dirección de envío.
        </li>
        <li>
          <strong>Administraciones públicas</strong> cuando exista obligación legal
          (Agencia Tributaria, AEPD, etc.).
        </li>
      </ul>
      <p>
        Las transferencias a EE.UU. se realizan al amparo de las Cláusulas Contractuales
        Tipo aprobadas por la Comisión Europea y, en su caso, del Data Privacy Framework
        UE–EE.UU.
      </p>

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
