import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nestly",
  description: "Everything your family needs. Together.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/nestly-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/nestly-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/nestly-apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nestly",
  },
};

export const viewport: Viewport = {
  themeColor: "#2bb3a6",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}
