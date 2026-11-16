import type { Metadata } from "next";
import "./globals.css";import {PWARegister} from "./pwa-register";
export const metadata:Metadata={title:"BARTIKA JEANS | إدارة المحل",description:"نظام إدارة المبيعات والمخزون لمحل BARTIKA JEANS",manifest:"/manifest.json"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body><PWARegister/>{children}</body></html>}