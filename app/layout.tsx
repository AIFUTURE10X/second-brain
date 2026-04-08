import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Second Brain",
  description: "Clips, notes, links & thoughts — synced everywhere",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-brand-dark">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
