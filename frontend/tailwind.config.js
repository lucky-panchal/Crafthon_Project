/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "defcomm-bg":     "#0B0F1A",
        "defcomm-card":   "#121826",
        "defcomm-border": "#1E2A3A",
      },
    },
  },
  plugins: [],
};
