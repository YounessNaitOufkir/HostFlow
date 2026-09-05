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
import { getCompanyName } from "@/lib/companyName";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

/**
 * The app is named by organization_settings.company_name, not by a string in this
 * file. Both titles below were hardcoded to "Host'Lik PM" and stayed that way when
 * the company was renamed in Settings.
 *
 * appleWebApp.title is the one that matters most: it is the label iOS puts under a
 * home-screen icon, and unlike the browser tab title it cannot be corrected from the
 * client afterwards.
 *
 * force-dynamic is required, not incidental. A Supabase read is not one of the
 * dynamic APIs Next watches for, so without it the route still prerenders and the
 * name is resolved once at build time and frozen into the HTML — a build made
 * before a rename shipped the old name indefinitely. Verified: a prerendered
 * login.html carried "Host'Lik" while the database already said "HostFlow".
 *
 * The cost is that / and /login render per request. Acceptable here — every request
 * already passes through proxy.ts, which calls supabase.auth.getUser(), so these
 * pages were never served from a cache anyway.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const name = await getCompanyName();

  return {
    title: name,
    description: "Manage your projects flawlessly",
    // No `manifest` field: app/manifest.ts is a file convention and Next emits the
    // <link> for it automatically at /manifest.webmanifest. The value that used to
    // sit here, "/manifest.json", is not a route in this app — proxy.ts 307s it to
    // /login — and was silently overridden by the file convention.
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: name,
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
            </LanguageProvider>
          </FontProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
