import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./server/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F7F9FC",
        foreground: "#172033",
        sidebar: {
          DEFAULT: "#111C35",
          foreground: "#F7F9FC",
          muted: "#94A3B8",
          border: "#1E293B",
          accent: "#1E2E56",
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#172033",
        },
        primary: {
          DEFAULT: "#2563EB",
          foreground: "#FFFFFF",
          hover: "#1D4ED8",
        },
        secondary: {
          DEFAULT: "#64748B",
          foreground: "#FFFFFF",
          light: "#F1F5F9",
        },
        success: {
          DEFAULT: "#059669",
          foreground: "#FFFFFF",
          light: "#ECFDF5",
        },
        warning: {
          DEFAULT: "#D97706",
          foreground: "#FFFFFF",
          light: "#FFFBEB",
        },
        critical: {
          DEFAULT: "#DC2626",
          foreground: "#FFFFFF",
          light: "#FEF2F2",
        },
        border: "#E2E8F0",
        input: "#E2E8F0",
        ring: "#2563EB",
      },
      borderRadius: {
        lg: "14px",
        md: "10px",
        sm: "6px",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
