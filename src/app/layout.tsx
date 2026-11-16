import type { Metadata } from "next";
import "./globals.css";import {PWARegister} from "./pwa-register";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://bartika-jeans.vercel.app";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "BARTIKA JEANS | بارتيكا جينز",
  description: "تسوق الجينز والملابس الرجالي من BARTIKA JEANS واطلب بسهولة.",
  manifest: "/manifest.json",
  openGraph: {
    title: "BARTIKA JEANS | بارتيكا جينز",
    description: "تسوق الجينز والملابس الرجالي من BARTIKA JEANS واطلب بسهولة.",
    url: siteUrl,
    siteName: "BARTIKA JEANS",
    locale: "ar_EG",
    type: "website",
  },
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body><PWARegister/>{children}</body></html>}