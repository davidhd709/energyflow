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
        // Paleta semántica nueva (recomendada para componentes nuevos).
        brand: {
          50: '#eef5ff',
          100: '#d9e8ff',
          200: '#b6d2ff',
          300: '#83b3ff',
          400: '#4d8bff',
          500: '#2769f5',
          600: '#1850d8',
          700: '#143fab',
          800: '#143789',
          900: '#13306d',
          950: '#0d1f47'
        },
        accent: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490'
        },
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857'
        },
        warn: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          400: '#facc15',
          500: '#eab308',
          600: '#ca8a04',
          700: '#a16207'
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c'
        },
        surface: {
          DEFAULT: '#ffffff',
          subtle: '#f7faff',
          muted: '#eef3fb',
          inverse: '#0d1b3d'
        },
        ink: {
          DEFAULT: '#0f1f3d',
          soft: '#243a64',
          muted: '#5a6f95',
          subtle: '#8499b9'
        },
        // Aliases retro-compat con la paleta vieja.
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
        // Sistema de elevaciones consistente.
        'elevation-1': '0 1px 2px 0 rgba(13, 31, 71, 0.06), 0 1px 3px 0 rgba(13, 31, 71, 0.08)',
        'elevation-2': '0 4px 8px -2px rgba(13, 31, 71, 0.08), 0 8px 16px -4px rgba(13, 31, 71, 0.10)',
        'elevation-3': '0 10px 20px -4px rgba(13, 31, 71, 0.12), 0 20px 40px -8px rgba(13, 31, 71, 0.14)',
        'elevation-4': '0 24px 48px -12px rgba(13, 31, 71, 0.18), 0 8px 24px -8px rgba(13, 31, 71, 0.10)',
        glow: '0 0 0 1px rgba(39, 105, 245, 0.10), 0 8px 32px -8px rgba(39, 105, 245, 0.30)',
        'inset-soft': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.65), inset 0 -1px 0 0 rgba(13, 31, 71, 0.04)',
        // Alias retro-compat.
        card: '0 18px 40px rgba(19, 82, 170, 0.12)'
      },
      borderRadius: {
        '4xl': '2rem'
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-title)', 'serif']
      },
      animation: {
        rise: 'rise 0.55s ease-out both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'fade-in-up': 'fade-in-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-soft': 'pulse-soft 2.5s ease-in-out infinite'
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' }
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' }
        }
      },
      backgroundImage: {
        'grid-soft':
          'linear-gradient(to right, rgba(20, 63, 171, 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(20, 63, 171, 0.06) 1px, transparent 1px)',
        'glow-radial':
          'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(39, 105, 245, 0.16), transparent 60%)',
        'brand-gradient': 'linear-gradient(135deg, #143fab 0%, #2769f5 50%, #06b6d4 100%)',
        'brand-soft':
          'linear-gradient(135deg, rgba(39, 105, 245, 0.10) 0%, rgba(6, 182, 212, 0.08) 100%)'
      },
      backgroundSize: {
        'grid-32': '32px 32px'
      }
    }
  },
  plugins: []
};

export default config;
