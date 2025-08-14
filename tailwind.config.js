/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'zombie-green': '#7CB342',
        'blood-red': '#D32F2F',
        'neon-blue': '#00D4FF',
        'neon-purple': '#B794F6',
      },
      fontFamily: {
        'gaming': ['Orbitron', 'monospace'],
      },
    },
  },
  plugins: [],
}