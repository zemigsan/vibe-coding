import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spec Interpreter Prototype",
  description: "Generate JavaScript from text and validate it with tests.",
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
