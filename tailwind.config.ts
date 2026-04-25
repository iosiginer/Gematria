import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#faf7f2",
        ink: "#1a1a1a",
        gold: "#a37f37",
        deep: "#1f3a5f",
        muted: "#6b6357",
      },
      fontFamily: {
        serif: ["var(--font-frank-ruhl)", "Times New Roman", "serif"],
        sans: ["var(--font-heebo)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
