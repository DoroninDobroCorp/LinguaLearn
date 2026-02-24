/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#fef08a', // light yellow
        secondary: '#bef264', // lime/salad green
        accent: '#fde047', // brighter yellow
        success: '#86efac', // light green
        error: '#fca5a5', // light red
      },
    },
  },
  plugins: [],
}
