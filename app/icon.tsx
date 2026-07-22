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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07070A",
          borderRadius: 96,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 400,
            height: 400,
            borderRadius: 88,
            border: "12px solid #C8A24C",
            color: "#C8A24C",
            fontSize: 300,
            fontWeight: 700,
            fontFamily:
              "ui-serif, Georgia, 'Times New Roman', Times, serif",
            letterSpacing: -8,
          }}
        >
          R
        </div>
      </div>
    ),
    { ...size }
  );
}
