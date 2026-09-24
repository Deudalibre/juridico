import { redirect } from "next/navigation";

// El layout de la app ya muestra la pantalla de «sin acceso»; esta ruta solo evita un bucle.
export default function SinAcceso() {
  redirect("/clientes");
}
