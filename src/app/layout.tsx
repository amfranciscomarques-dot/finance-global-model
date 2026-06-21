import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/i18n/locale-context";

// IBM Plex: an engineered, finance-grade pairing. Plex Mono carries every
// figure in the app (tabular, unambiguous); Plex Sans handles UI chrome.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ConsolidaçãoFX - Multi-Company Financial Consolidation",
  description: "Professional financial planning and consolidation platform for international groups. Multi-entity reporting, scenario analysis, and FX management.",
  keywords: ["financial consolidation", "multi-entity", "reporting", "FX rates", "scenario analysis", "variance analysis"],
  authors: [{ name: "ConsolidaçãoFX" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "ConsolidaçãoFX - Financial Consolidation",
    description: "Professional multi-company financial consolidation platform",
    url: "https://github.com/amfranciscomarques-dot/finance-global-model",
    siteName: "ConsolidaçãoFX",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ConsolidaçãoFX",
    description: "Professional multi-company financial consolidation platform",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${plexSans.variable} ${plexMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <I18nProvider>
            {children}
            <Toaster />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
