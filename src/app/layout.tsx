import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Intelligence Platform",
  description: "Personal job intelligence dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
