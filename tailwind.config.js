/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        peacock: {
          50: '#e6f7f4',
          100: '#b3e8dd',
          200: '#80d9c6',
          300: '#4dcaaf',
          400: '#1abc9c',
          500: '#16a085',
          600: '#138d75',
          700: '#117a65',
          800: '#0e6655',
          900: '#0b5345',
        },
      },
    },
  },
  plugins: [],
};
