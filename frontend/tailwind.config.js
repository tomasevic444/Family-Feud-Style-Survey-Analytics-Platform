/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
    },
    extend: {
      fontFamily: {
        sans: [
          'Inter var',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'Inter var',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.05)',
        'card-lift': '0 10px 30px -12px rgba(15, 23, 42, 0.18), 0 4px 12px -4px rgba(15, 23, 42, 0.10)',
        soft: '0 1px 1px rgba(15, 23, 42, 0.04), 0 2px 8px rgba(15, 23, 42, 0.04)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        scaleIn: {
          '0%': { opacity: 0, transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.35 },
        },
      },
      animation: {
        shimmer: 'shimmer 1.8s linear infinite',
        'fade-in': 'fadeIn 160ms ease-out both',
        'scale-in': 'scaleIn 180ms ease-out both',
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
      },
      backgroundImage: {
        'shimmer-stripe':
          'linear-gradient(90deg, rgba(226,232,240,0) 0%, rgba(226,232,240,0.6) 50%, rgba(226,232,240,0) 100%)',
      },
    },
  },
  plugins: [],
};
