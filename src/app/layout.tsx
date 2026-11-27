import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWARegister } from "./pwa-register";
import { BRAND_LOGO_URL } from "@/lib/brand";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bartika-jeans.vercel.app";

export const viewport: Viewport = { themeColor: "#12744c", colorScheme: "light" };

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "BARTIKA JEANS | بارتيكا جينز",
  description: "تسوق الجينز والملابس الرجالي من BARTIKA JEANS واطلب بسهولة.",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon-monogram.png", type: "image/png", sizes: "256x256" }],
    shortcut: [{ url: "/favicon-monogram.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    title: "BARTIKA JEANS | بارتيكا جينز",
    description: "تسوق الجينز والملابس الرجالي من BARTIKA JEANS واطلب بسهولة.",
    url: siteUrl, siteName: "BARTIKA JEANS", locale: "ar_EG", type: "website",
    images: [{ url: BRAND_LOGO_URL, width: 512, height: 512, alt: "شعار BARTIKA JEANS" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BARTIKA JEANS | بارتيكا جينز",
    description: "تسوق الجينز والملابس الرجالي من BARTIKA JEANS واطلب بسهولة.",
    images: [BRAND_LOGO_URL],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ar" dir="rtl"><body><PWARegister />{children}</body></html>;
}
