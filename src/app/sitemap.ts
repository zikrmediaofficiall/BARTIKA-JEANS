import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://bartika-jeans.vercel.app").replace(/\/+$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: siteUrl + "/shop",
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: siteUrl + "/links",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
