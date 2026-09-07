import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"DM Sans"', "system-ui", "sans-serif"], mono: ['"JetBrains Mono"', "monospace"] },
      colors: {
        brand: { DEFAULT: "#2563eb", light: "#3b82f6", dim: "rgba(37,99,235,0.06)" },
        surface: { DEFAULT: "#ffffff", muted: "#f8fafc", raised: "#f1f5f9" },
        border: { DEFAULT: "#e2e8f0", strong: "#cbd5e1" },
        text: { DEFAULT: "#0f172a", secondary: "#475569", muted: "#94a3b8" },
        success: { DEFAULT: "#059669", dim: "rgba(5,150,105,0.08)" },
        warn: { DEFAULT: "#d97706", dim: "rgba(217,119,6,0.08)" },
      },
      animation: { enter: "enter 0.3s ease-out" },
      keyframes: { enter: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } } },
    },
  },
  plugins: [],
};
export default config;
