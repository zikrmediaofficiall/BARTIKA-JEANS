import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Legacy "emerald" utility names now map to the real BARTIKA emerald palette sampled from the logo.
        emerald: {
          50: "#effaf3", 100: "#d7f2e1", 200: "#b0e3c6", 300: "#7ccda5",
          400: "#3fae7c", 500: "#1f8f5f", 600: "#12744c", 700: "#0d5c3d",
          800: "#0a4a31", 900: "#073824", 950: "#03140b",
        },
        navy: { 900: "#073824", 950: "#03140b" },
        royal: { 500: "#1f8f5f", 600: "#12744c", 900: "#073824" },
        gold: { 300: "#f9d889", 400: "#e1ba56", 500: "#8a6a14" },
      },
      boxShadow: {
        soft: "0 12px 40px rgba(0,16,64,.12)",
        "brand-gold": "0 0 0 1px rgba(249,216,137,.36), 0 12px 30px rgba(0,16,64,.18)",
      },
    },
  },
  plugins: [],
} satisfies Config;
