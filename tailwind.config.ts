import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#E8A838", dark: "#0D0F12", card: "#13161B", border: "#1E2128", muted: "#181B21" },
        type: { note: "#E8A838", link: "#5B8DEF", clip: "#6FCF97", thought: "#BB6BD9" },
      },
    },
  },
  plugins: [],
};
export default config;
