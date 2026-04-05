import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        pine: {
          50: '#f0f7ff',
          100: '#d9ecff',
          200: '#b9dcff',
          300: '#87c5ff',
          400: '#4da7ff',
          500: '#2687f5',
          600: '#1668d5',
          700: '#1352aa',
          800: '#154786',
          900: '#173d6e'
        },
        cream: '#f7fbff',
        olive: '#0f766e'
      },
      boxShadow: {
        card: '0 18px 40px rgba(19, 82, 170, 0.12)'
      },
      animation: {
        rise: 'rise 0.55s ease-out both'
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: []
};

export default config;
