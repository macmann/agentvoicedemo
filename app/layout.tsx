import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Container } from "@/components/layout/Container";

export const metadata: Metadata = {
  title: {
    default: "Hybrid AI Voice Demo",
    template: "%s | Hybrid AI Voice Demo"
  },
  description: "Hybrid AI Voice Demo"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900">
        <Header />
        <Container className="py-10">{children}</Container>
        <Footer />
      </body>
    </html>
  );
}
