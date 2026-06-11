/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Be Vietnam Pro"', 'sans-serif'] },
      colors: {
        brand: {
          blue: '#0030CC',
          green: '#00CC66',
          blue600: '#0033CC',
        },
        neutral: { 900: '#1A1F36', 500: '#6B7280' },
        bg: '#F7F9FC',
        warning: '#F5A623',
        danger: '#E5484D',
      },
      borderRadius: { DEFAULT: '8px', lg: '12px' },
    },
  },
  plugins: [],
}
