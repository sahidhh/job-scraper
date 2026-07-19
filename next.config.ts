import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist"],
  // pdf.js resolves pdf.worker.mjs through a dynamic import the tracer can't
  // see, so Vercel omitted it from the lambda and resume upload failed with
  // "Cannot find module .../pdf.worker.mjs". Force it into the server bundle.
  // See src/features/resume/infrastructure/parsePdf.ts.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
