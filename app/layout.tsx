import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full font-sans lg:flex lg:h-dvh lg:overflow-hidden"
        suppressHydrationWarning
      >
        {/* Sidebar — desktop only */}
        <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800">
            <p className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              🇩🇪 Deutsch Partner
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Sprich — höre — übe
            </p>
          </div>
          <nav className="flex flex-col gap-1 p-3">
            <a
              href="/"
              className="flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <SidebarMicIcon />
              Sprechen
            </a>
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col lg:overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}

function SidebarMicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
