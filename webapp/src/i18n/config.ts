export const locales = ["en", "de", "es", "fr", "pt"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
