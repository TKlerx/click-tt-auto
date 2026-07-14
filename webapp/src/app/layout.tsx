import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AppVersionBadge } from "@/components/ui/AppVersionBadge";
import { ToastProvider } from "@/components/ui/Toast";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const themePaint = {
  DARK: { backgroundColor: "#0c1320", colorScheme: "dark" },
  LIGHT: { backgroundColor: "#f5f7fa", colorScheme: "light" },
} as const;

export const metadata: Metadata = {
  title: "Business App Starter",
  description: "Reusable internal business app starter",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sessionPromise = getSessionUser();
  const configuredBasePath = process.env.BASE_PATH ?? "";
  const [locale, user] = await Promise.all([getLocale(), sessionPromise]);
  const initialTheme = user?.themePreference ?? "DARK";

  return (
    <html
      data-theme={initialTheme.toLowerCase()}
      lang={locale}
      style={themePaint[initialTheme]}
      suppressHydrationWarning
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
        data-base-path={configuredBasePath}
      >
        <SessionLayout locale={locale} user={user}>
          {children}
        </SessionLayout>
      </body>
    </html>
  );
}

async function SessionLayout({
  locale,
  user,
  children,
}: {
  locale: Awaited<ReturnType<typeof getLocale>>;
  user: Awaited<ReturnType<typeof getSessionUser>>;
  children: React.ReactNode;
}) {
  const initialTheme = user?.themePreference ?? "DARK";
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SessionProvider user={user}>
        <ThemeProvider initialTheme={initialTheme}>
          <ToastProvider>
            {children}
            <AppVersionBadge />
          </ToastProvider>
        </ThemeProvider>
      </SessionProvider>
    </NextIntlClientProvider>
  );
}
