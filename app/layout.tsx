import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { QueryProvider } from "@/components/QueryProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "sonner";
import { FontProvider } from "@/components/FontProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import PWAInstallPrompt from "@/components/ui/PWAInstallPrompt";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import { APP_NAME } from "@/lib/companyName";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    // Required for Next to emit absolute canonical/OG URLs at all, and the
    // root cause of Search Console's "duplicate without user-selected
    // canonical": with no metadataBase, no page ever declared one, so any
    // domain/trailing-slash variant Google found looked equally legitimate.
    // Same env var app/lib/emailTemplate.ts's appUrl() already treats as this
    // app's one canonical origin, so this can't drift from it.
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
    // Applies to every route that doesn't declare its own (privacy, terms) —
    // covers /, /login and /update-password, none of which have unique
    // indexable content of their own.
    alternates: { canonical: "/" },
    title: APP_NAME,
    description: "Manage your projects flawlessly",
    // No `manifest` field: app/manifest.ts is a file convention and Next emits the
    // <link> for it automatically at /manifest.webmanifest. The value that used to
    // sit here, "/manifest.json", is not a route in this app — proxy.ts 307s it to
    // /login — and was silently overridden by the file convention.
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: APP_NAME,
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      // apple must be a PNG — apple-icon does not accept SVG, so the previous
      // "/icon.svg" here meant iOS rendered no home-screen icon at all. Both are
      // declared explicitly because an explicit icons object suppresses the
      // app/apple-icon file convention rather than merging with it.
      icon: "/icon.svg",
      apple: "/apple-icon.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#1A2C5B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Outfit:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&family=Shantell+Sans:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col font-[var(--font-inter)]" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <FontProvider>
            <LanguageProvider>
              <QueryProvider>
                <AuthProvider>{children}</AuthProvider>
              </QueryProvider>
              <Toaster
                position="bottom-right"
                toastOptions={{
                  className: "font-[var(--font-inter)]",
                  style: {
                    fontSize: "13px",
                  },
                }}
                richColors
                closeButton
                duration={4000}
              />
              <PWAInstallPrompt />
              <ServiceWorkerRegistration />
            </LanguageProvider>
          </FontProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
