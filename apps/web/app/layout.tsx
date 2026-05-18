import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArcBuy",
  description: "Production-ready private group-buy on Arc testnet"
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
