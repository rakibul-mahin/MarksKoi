import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Hanken_Grotesk, IBM_Plex_Mono, Young_Serif } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const display = Young_Serif({ variable: "--font-display", subsets: ["latin"], weight: "400", display: "swap" });
const body = Hanken_Grotesk({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const data = IBM_Plex_Mono({ variable: "--font-data", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "MarksKoi?", template: "%s · MarksKoi?" },
  description: "Marks koi? Ekhanei! Your course marks, straight from your instructor's gradebook.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1412" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set by src/proxy.ts; lets the theme script run under the Content-Security-Policy.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable} ${data.variable} h-full`}>
      {/* Browser extensions inject attributes on <body> before hydration (e.g. __processed_…__). */}
      <body className="min-h-full" suppressHydrationWarning>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow">
          Skip to content
        </a>
        <AppProviders nonce={nonce}>{children}</AppProviders>
      </body>
    </html>
  );
}
