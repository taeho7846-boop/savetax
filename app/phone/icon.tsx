import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #3182F6 0%, #1B64DA 60%, #0049BC 100%)",
          color: "white",
          fontSize: 320,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: "-18px",
        }}
      >
        S
      </div>
    ),
    { ...size }
  );
}
