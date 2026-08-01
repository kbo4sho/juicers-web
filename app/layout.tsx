import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title: {
      default: "Juicers",
      template: "%s — Juicers",
    },
    description:
      "A camera-powered fruit-catching game. Pinch the matching fruit and juice the high score.",
    applicationName: "Juicers",
    openGraph: {
      title: "Juicers — Camera-powered fruit chaos",
      description: "Pinch matching falling fruit and juice the high score.",
      type: "website",
      images: [{ url: socialImage, width: 1731, height: 909, alt: "Juicers game artwork" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Juicers — Camera-powered fruit chaos",
      description: "Pinch matching falling fruit and juice the high score.",
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#171218",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
