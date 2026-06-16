import { redirect } from "next/navigation";

/**
 * /cesta — alias de /carrito. En el nav el botón del carrito se etiqueta "Cesta"
 * pero la ruta real es /carrito; redirigimos para que quien teclee /cesta no
 * acabe en un 404.
 */
export default function CestaPage() {
  redirect("/carrito");
}
