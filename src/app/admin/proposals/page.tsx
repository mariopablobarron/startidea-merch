import { redirect } from "next/navigation";

/**
 * /admin/proposals → /admin/propuestas
 *
 * El listado de propuestas vive en español (`/admin/propuestas`) y todos los
 * enlaces internos apuntan ahí, pero bajo `/admin/proposals` sí existen dos
 * subrutas reales (`/ai` y `/new`). La raíz en inglés se quedaba sin página,
 * así que quien llegaba a ella —desde un marcador, recortando la URL de
 * `/admin/proposals/new`, o simplemente probando el nombre en inglés— se comía
 * un 404 del sitio público, sin ninguna pista de dónde estaba el listado.
 */
export default function AdminProposalsRedirect() {
  redirect("/admin/propuestas");
}
