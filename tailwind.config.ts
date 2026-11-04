import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: {
        brand: { 50: "#eef4ff", 100: "#dce8ff", 200: "#bcd2ff", 300: "#8db2ff", 400: "#5a87fb", 500: "#3b66f0", 600: "#2a4ee0", 700: "#233fc0", 800: "#22389b", 900: "#21347a" },
        ink: { 50: "#f7f7f8", 100: "#efeff1", 200: "#e3e3e7", 300: "#c9c9d1", 400: "#9c9caa", 500: "#71717f", 600: "#55556a", 700: "#3f3f50", 800: "#2a2a37", 900: "#18181f" },
      },
      boxShadow: { card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)" },
    },
  },
  plugins: [],
} satisfies Config;
