import { ImageResponse } from "next/og";

// Icono de 180 px para pantallas de inicio (iOS/Android) y pestañas ancladas: la misma marca
// turquesa que el mosaico de la barra lateral. Se genera en el build; no hace falta un PNG en el repo.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0cc1e0 0%, #087f9c 100%)",
          color: "#fff",
          fontSize: 76,
          fontWeight: 700,
          letterSpacing: 2,
          fontFamily: "Inter, Helvetica, Arial, sans-serif",
        }}
      >
        DL
      </div>
    ),
    size,
  );
}
