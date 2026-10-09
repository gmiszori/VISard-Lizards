/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          500: '#0284c7',
          600: '#0369a1',
          700: '#1d4ed8',
          900: '#0f172a',
        },
        eth: {
          blue: '#1f407a',
          red: '#b82326',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.08)',
        'float': '0 12px 24px -6px rgba(0, 0, 0, 0.12)',
      }
    },
  },
  plugins: [],
};