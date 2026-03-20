/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: "#FFD700",
          dark:   "#0A0A0A",
          panel:  "#141414",
          border: "#262626",
          muted:  "#71717A",
        },
      },
      fontFamily: {
        sans:    ["Inter", "sans-serif"],
        display: ["Montserrat", "sans-serif"],
      },
    },
  },
  plugins: [],
};
