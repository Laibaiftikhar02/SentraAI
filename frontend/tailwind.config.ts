import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#0a0e1a",
          800: "#0f1629",
          700: "#151d35",
          600: "#1b2541",
        },
        glass: {
          DEFAULT: "rgba(255, 255, 255, 0.05)",
          light: "rgba(255, 255, 255, 0.08)",
          border: "rgba(255, 255, 255, 0.1)",
        },
        urgency: {
          critical: "#ef4444",
          high: "#f97316",
          medium: "#eab308",
          low: "#22c55e",
        },
      },
      backdropBlur: {
        glass: "12px",
      },
    },
  },
  plugins: [],
};
export default config;
