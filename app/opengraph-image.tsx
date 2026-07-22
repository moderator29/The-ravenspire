import { ImageResponse } from "next/og";

export const alt = "The Ravenspire. See every chain. Fear no rug. Rule your realm.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#07070A",
          backgroundImage:
            "radial-gradient(circle at 50% 38%, rgba(200,162,76,0.16), rgba(7,7,10,0) 60%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 172,
            height: 172,
            borderRadius: 40,
            border: "8px solid #C8A24C",
            color: "#C8A24C",
            fontSize: 128,
            fontWeight: 700,
            fontFamily:
              "ui-serif, Georgia, 'Times New Roman', Times, serif",
            letterSpacing: -4,
          }}
        >
          R
        </div>
        <div
          style={{
            marginTop: 44,
            color: "#C8A24C",
            fontSize: 92,
            fontWeight: 700,
            letterSpacing: 14,
            fontFamily:
              "ui-serif, Georgia, 'Times New Roman', Times, serif",
          }}
        >
          THE RAVENSPIRE
        </div>
        <div
          style={{
            marginTop: 24,
            color: "#B9B4A8",
            fontSize: 34,
            letterSpacing: 2,
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          }}
        >
          See every chain. Fear no rug. Rule your realm.
        </div>
      </div>
    ),
    { ...size }
  );
}
