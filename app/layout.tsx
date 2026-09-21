import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulong — free, unlimited video meetings",
  description:
    "Open-source, browser-based video meetings with no accounts, no time limits, and no cost.",
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
