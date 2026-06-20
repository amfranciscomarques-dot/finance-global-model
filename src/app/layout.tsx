import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
