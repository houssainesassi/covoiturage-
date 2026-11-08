import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { IBM_Plex_Sans_Arabic, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import { getI18n } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { BottomNav } from "@/components/layout/bottom-nav";
import { getUser } from "@/lib/auth";
import { FlashToast } from "@/components/ui/client";
import { InstallPrompt, captureInstallPromptScript } from "@/components/layout/install-prompt";
import { env } from "@/lib/env";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-arabic", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return {
    metadataBase: env.siteUrl ? new URL(env.siteUrl) : undefined,
    title: { default: d.meta.title, template: `%s · ${d.common.appName}` },
    description: d.meta.description,
    appleWebApp: { capable: true, title: d.common.appName, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = { themeColor: "#1a7e68", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, d, dir } = await getI18n();
  const user = await getUser();
  return (
    <html lang={locale} dir={dir} className={`${jakarta.variable} ${arabic.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: captureInstallPromptScript }} />
      </head>
      <body className="flex min-h-full flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <I18nProvider locale={locale} dictionary={d}>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
          <BottomNav signedIn={Boolean(user)} />
          <Suspense>
            <FlashToast />
          </Suspense>
          <InstallPrompt />
          <Toaster position="top-center" dir={dir} richColors closeButton />
        </I18nProvider>
        <Analytics />
      </body>
    </html>
  );
}
