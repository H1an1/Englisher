import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Englisher",
  description: "Dictation and shadowing practice for English video clips"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

