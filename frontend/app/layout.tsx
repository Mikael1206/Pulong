import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulong — free class calls without the 40-minute cutoff",
  description:
    "Open-source video meetings for students and instructors: no accounts, no time limits, no Pro plan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
