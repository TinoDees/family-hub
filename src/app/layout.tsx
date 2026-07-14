import type { Metadata, Viewport } from "next";
import Script from "next/script";
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
        {/* Catch Chrome's install prompt before React loads — it fires once, early. */}
        <Script id="nestly-install-capture" strategy="beforeInteractive">{`
          window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            window.__nestlyInstall = e;
            window.dispatchEvent(new Event('nestly-install-ready'));
          });
          window.addEventListener('appinstalled', function () {
            window.__nestlyInstall = null;
            window.dispatchEvent(new Event('nestly-install-done'));
          });
        `}</Script>
        {children}
      </body>
    </html>
  );
}
