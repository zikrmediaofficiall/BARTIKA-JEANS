import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://bartika-jeans.vercel.app").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/shop", "/links", "/sitemap.xml"],
      disallow: [
        "/",
        "/login",
        "/forgot-password",
        "/reset-password",
        "/pos",
        "/products",
        "/inventory",
        "/purchases",
        "/online-orders",
        "/customers",
        "/invoices",
        "/cash",
        "/reports",
        "/stocktake",
        "/exchanges",
        "/staff",
        "/settings",
        "/shipping",
        "/barcodes",
        "/qr",
      ],
    },
    sitemap: siteUrl + "/sitemap.xml",
  };
}
