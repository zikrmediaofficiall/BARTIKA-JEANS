import type { Metadata } from "next";
import "./globals.css";import {PWARegister} from "./pwa-register";
export const metadata:Metadata={title:"BARTIKA JEANS | بارتيكا جينز",description:"تسوق الجينز والملابس الرجالي من BARTIKA JEANS واطلب بسهولة.",manifest:"/manifest.json"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body><PWARegister/>{children}</body></html>}