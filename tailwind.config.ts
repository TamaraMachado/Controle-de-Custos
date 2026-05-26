import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        display: ["var(--font-sora)", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#dde6ff",
          200: "#c2d0ff",
          300: "#9cb0ff",
          400: "#7585fd",
          500: "#5560f8",
          600: "#3d3eed",
          700: "#322fd3",
          800: "#2b2aaa",
          900: "#292b86",
          950: "#1a1a52",
        },
      },
    },
  },
  plugins: [],
};
export default config;
