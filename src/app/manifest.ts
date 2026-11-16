import type { MetadataRoute } from "next";

const logo = "https://res.cloudinary.com/lnsnp6km/image/upload/v1794847704/bartika-brand-logo-2026.webp";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BARTIKA JEANS",
    short_name: "BARTIKA",
    description: "BARTIKA JEANS — متجر الجينز الرجالي ونظام إدارة الفرع",
    start_url: "/",
    display: "standalone",
    background_color: "#000010",
    theme_color: "#0038C8",
    lang: "ar",
    dir: "rtl",
    icons: [{ src: logo, sizes: "256x256", type: "image/webp", purpose: "any" }],
  };
}
