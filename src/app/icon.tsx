import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Matches Wordmark.tsx's mark (near-black rounded square, "J"), but drawn as
// a stroked path instead of a text glyph -- satori/resvg only bundle a
// regular-weight fallback font, so fontWeight:800 rendered thin and
// off-center at 32px. A vector stroke (lucide-style, same weight as the
// rest of the app's iconography) stays crisp at favicon size.
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
          background: "#0a0a0a",
          borderRadius: 7,
        }}
      >
        <svg
          width="62%"
          height="62%"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fafafa"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 3 V15.5 A5.5 5.5 0 0 1 12.5 21 A5.5 5.5 0 0 1 7.5 18" />
        </svg>
      </div>
    ),
    size,
  );
}
