/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#12263A', 700: '#1B3550', 600: '#2A4A6B', 500: '#4B6A88' },
        paper: '#F3F6F8',
        teal: { DEFAULT: '#0F8B8D', dark: '#0B6F71', soft: '#E1F3F3' },
        amber: { DEFAULT: '#E8A33D', soft: '#FCF1DC' },
        rose: { DEFAULT: '#D1495B', soft: '#FBE7EA' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
