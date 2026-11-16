import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Keep legacy emerald utility names, mapped to BARTIKA's navy and royal-blue identity.
        emerald: {
          50: "#f0f4ff", 100: "#dfe8ff", 200: "#b9ceff", 300: "#7ea3ff",
          400: "#3b73f0", 500: "#1454de", 600: "#0b43c3", 700: "#08339b",
          800: "#0038c8", 900: "#001b68", 950: "#000010",
        },
        navy: { 900: "#001068", 950: "#000010" },
        royal: { 500: "#0b52f0", 600: "#0038c8", 900: "#001068" },
        gold: { 300: "#f8e888", 400: "#e7bd51", 500: "#c9942c" },
      },
      boxShadow: {
        soft: "0 12px 40px rgba(0,16,64,.12)",
        "brand-gold": "0 0 0 1px rgba(248,232,136,.36), 0 12px 30px rgba(0,16,64,.18)",
      },
    },
  },
  plugins: [],
} satisfies Config;
