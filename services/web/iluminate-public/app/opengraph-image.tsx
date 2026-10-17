import { ImageResponse } from "next/og";

export const alt = "Iluminate — diseño, animación y simulación de rótulos LED";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#f4f1ea",
        color: "#0b0b0d",
        display: "flex",
        fontFamily: "Arial, sans-serif",
        height: "100%",
        justifyContent: "space-between",
        padding: "64px",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "67%" }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>ILUMINATE</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 72, fontWeight: 700, letterSpacing: "-4px", lineHeight: 0.95 }}>
          <span>Diseña la forma.</span>
          <span>Compón la luz.</span>
        </div>
      </div>
      <div style={{ alignItems: "center", background: "#0b0b0d", display: "flex", justifyContent: "center", width: "29%" }}>
        <div style={{ background: "#ff3b30", borderRadius: "50%", boxShadow: "0 0 90px #ff3b30", display: "flex", height: 82, width: 82 }} />
      </div>
    </div>,
    size,
  );
}
