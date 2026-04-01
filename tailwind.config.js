/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: "#fed107",
          dark:   "#111011",
          panel:  "#1a1a1a",
          border: "#262626",
          muted:  "#71717A",
          text:   "#dfebf7",
          red:    "#e03535",
        },
      },
      fontFamily: {
        sans:    ["'Mona Sans Variable'", "Inter", "sans-serif"],
        display: ["var(--font-kanit)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
