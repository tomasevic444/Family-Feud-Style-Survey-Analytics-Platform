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
        // Primary brand: violet-leaning indigo (AI / data product feel)
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
          950: '#1e1b4b',
        },
        // Secondary accent: cyan (analytics highlights / semantic chart)
        accent: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
        },
        // Deep navy used for the app shell / hero / participant chrome
        night: {
          50: '#f1f5f9',
          100: '#e2e8f0',
          200: '#cbd5e1',
          300: '#94a3b8',
          400: '#64748b',
          500: '#475569',
          600: '#334155',
          700: '#1e293b',
          800: '#0f172a',
          900: '#0a0f1f',
          950: '#050813',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 1px 3px 0 rgba(15, 23, 42, 0.05)',
        'card-lift': '0 10px 30px -12px rgba(15, 23, 42, 0.18), 0 4px 12px -4px rgba(15, 23, 42, 0.10)',
        soft: '0 1px 1px rgba(15, 23, 42, 0.04), 0 2px 8px rgba(15, 23, 42, 0.04)',
        glow: '0 0 0 1px rgba(99, 102, 241, 0.25), 0 12px 36px -10px rgba(79, 70, 229, 0.45)',
        'glow-cyan': '0 0 0 1px rgba(34, 211, 238, 0.25), 0 12px 36px -10px rgba(6, 182, 212, 0.4)',
        'glow-emerald': '0 0 0 1px rgba(16, 185, 129, 0.25), 0 12px 30px -10px rgba(16, 185, 129, 0.35)',
        'inner-line': 'inset 0 0 0 1px rgba(255, 255, 255, 0.06)',
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
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.8s linear infinite',
        'fade-in': 'fadeIn 160ms ease-out both',
        'scale-in': 'scaleIn 180ms ease-out both',
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
        'gradient-shift': 'gradientShift 6s ease-in-out infinite',
      },
      backgroundImage: {
        'shimmer-stripe':
          'linear-gradient(90deg, rgba(226,232,240,0) 0%, rgba(226,232,240,0.6) 50%, rgba(226,232,240,0) 100%)',
        // Diagonal grid for hero panels
        'grid-fade':
          'linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px)',
        // Brand → cyan
        'brand-cyan':
          'linear-gradient(135deg, #4f46e5 0%, #6366f1 35%, #22d3ee 100%)',
      },
    },
  },
  plugins: [],
};
