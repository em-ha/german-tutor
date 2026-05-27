import type { Metadata } from "next";
import { Geist, Geist_Mono, Special_Gothic_Condensed_One } from "next/font/google";
import { SdkNoiseSuppressor } from "@/components/SdkNoiseSuppressor";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const specialGothic = Special_Gothic_Condensed_One({
  variable: "--font-special-gothic",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Deutsch Partner — Sprechen üben",
  description: "German speaking practice — voice-first partner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} ${specialGothic.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="h-full font-sans"
        suppressHydrationWarning
      >
        <SdkNoiseSuppressor />
        {children}
      </body>
    </html>
  );
}
