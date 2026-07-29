import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards the design tokens against a contrast regression. It parses the real
// globals.css rather than restating the values, so editing a token to something
// unreadable fails here instead of shipping (docs/decisions.md AD-62).
//
// `--success` and `--info` previously sat at L 0.6 with white text, rendering at
// ~3.5:1 -- below the AA minimum, on the score pill the whole dashboard is read
// through.

const AA_NORMAL_TEXT = 4.5;

const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** Read one custom property out of the `:root` or `.dark` block. */
function readToken(block: "root" | "dark", name: string): Oklch {
  const blockPattern = block === "root" ? /:root\s*\{([\s\S]*?)\n\}/ : /\.dark\s*\{([\s\S]*?)\n\}/;
  const blockMatch = css.match(blockPattern);
  const blockBody = blockMatch?.[1];
  if (blockBody === undefined) throw new Error(`No ${block} block in globals.css`);

  const declaration = blockBody.match(
    new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  if (declaration === null) throw new Error(`--${name} is not a plain oklch() value in ${block}`);

  return { l: Number(declaration[1]), c: Number(declaration[2]), h: Number(declaration[3]) };
}

/**
 * OKLCH to linear sRGB, clamped to the gamut. Clamping matters: several of these
 * chromas sit marginally outside sRGB, and the browser clips them the same way,
 * so the ratio computed here is the one a user actually sees.
 */
function toLinearRgb({ l: L, c: C, h: hDeg }: Oklch): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const lRoot = L + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = L - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = L - 0.0894841775 * a - 1.2914855480 * b;
  const [l, m, s] = [lRoot ** 3, mRoot ** 3, sRoot ** 3];

  const clamp = (value: number): number => Math.max(0, Math.min(1, value));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

/** WCAG relative luminance, which is defined on linear-light values. */
function luminance(colour: Oklch): number {
  const [r, g, b] = toLinearRgb(colour);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: Oklch, background: Oklch): number {
  const [a, b] = [luminance(foreground), luminance(background)];
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

describe("design token contrast", () => {
  // Every solid chip Badge renders: bg-<token> with text-<token>-foreground.
  const solidChips = ["success", "warning", "info"] as const;

  describe.each(["root", "dark"] as const)("%s theme", (block) => {
    it.each(solidChips)("%s chip text clears AA", (token) => {
      const ratio = contrastRatio(readToken(block, `${token}-foreground`), readToken(block, token));
      expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it("primary chip text clears AA", () => {
      const ratio = contrastRatio(readToken(block, "primary-foreground"), readToken(block, "primary"));
      expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });
  });

  // Badge/Button render destructive with a literal `text-white`, not
  // --destructive-foreground, so white is what has to be checked. Only the light
  // theme is asserted: the dark variant is `dark:bg-destructive/60`, an alpha
  // composite this token-level check cannot model. See
  // docs/plans/dark-mode-plan.md.
  it("destructive chip carries white text at AA in the light theme", () => {
    const white: Oklch = { l: 1, c: 0, h: 0 };
    expect(contrastRatio(white, readToken("root", "destructive"))).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  // text-primary over the bg-primary/10 wash -- stat chips, the sidebar active
  // state, selected role chips. Low-contrast by construction, so it is the
  // pairing most likely to regress unnoticed.
  it.each([
    ["root", { l: 1, c: 0, h: 0 }],
    ["dark", { l: 0.145, c: 0, h: 0 }],
  ] as const)("%s accent wash keeps its text at AA", (block, pageBackground) => {
    const primary = readToken(block, "primary");
    const [tintR, tintG, tintB] = toLinearRgb(primary);
    const [pageR, pageG, pageB] = toLinearRgb(pageBackground);
    const mix = (tint: number, page: number): number => tint * 0.1 + page * 0.9;

    const washLuminance =
      0.2126 * mix(tintR, pageR) + 0.7152 * mix(tintG, pageG) + 0.0722 * mix(tintB, pageB);
    const textLuminance = luminance(primary);
    const [lighter, darker] =
      textLuminance > washLuminance ? [textLuminance, washLuminance] : [washLuminance, textLuminance];

    expect((lighter + 0.05) / (darker + 0.05)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
