/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sage: '#8B9A6E',
        cream: '#F7F2EB',
        sand: '#EAE2D6',
        cloud: '#EEEEEE',
        ink: '#262B1F',
      },
      fontFamily: {
        display: ['Barlow Condensed', 'Impact', 'sans-serif'],
        body: ['Barlow', 'Arial', 'sans-serif'],
      },
      borderRadius: { ui: '8px', pill: '999px' },
    },
  },
  plugins: [],
}
