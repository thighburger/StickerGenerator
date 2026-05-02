import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pet Sticker Sheet Generator",
  description: "Remove backgrounds and generate an A6 pet sticker sheet PNG.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

