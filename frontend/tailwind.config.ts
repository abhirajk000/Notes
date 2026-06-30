import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-outfit)', 'Outfit', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Instrument Serif', 'Georgia', 'serif'],
      },
      colors: {
        surface: {
          DEFAULT: '#f8f6fc',
          dark: '#0f0d14',
        },
        sidebar: {
          DEFAULT: '#f3f0f8',
          dark: '#16131c',
        },
        notelist: {
          DEFAULT: '#faf9fd',
          dark: '#1a1722',
        },
        editor: {
          DEFAULT: '#ffffff',
          dark: '#121018',
        },
        accent: {
          DEFAULT: '#8b5cf6',
          light: '#a78bfa',
          dark: '#7c3aed',
          muted: '#ede9fe',
          'muted-dark': '#2a1f3d',
        },
        brand: {
          DEFAULT: '#8b5cf6',
          soft: '#ede9fe',
          deep: '#4c1d95',
        },
      },
      boxShadow: {
        soft: '0 2px 16px rgba(76, 29, 149, 0.06)',
        'soft-md': '0 4px 24px rgba(76, 29, 149, 0.08)',
        'soft-lg': '0 8px 40px rgba(76, 29, 149, 0.1)',
        'soft-xl': '0 20px 60px rgba(76, 29, 149, 0.12)',
        'soft-inset': 'inset 0 1px 2px rgba(76, 29, 149, 0.04)',
        glow: '0 0 32px rgba(139, 92, 246, 0.2)',
        'glow-sm': '0 0 16px rgba(139, 92, 246, 0.15)',
        glass: '0 8px 32px rgba(15, 13, 20, 0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
        'glass-dark': '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        card: '0 1px 3px rgba(76,29,149,0.04), 0 4px 16px rgba(76,29,149,0.06)',
        'card-hover': '0 4px 12px rgba(76,29,149,0.08), 0 12px 32px rgba(76,29,149,0.1)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
        '4xl': '1.5rem',
      },
      transitionProperty: {
        layout: 'transform, opacity, width',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'fade-out': {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.97)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'soft-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.65' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'gradient-shift': {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '0.8' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease forwards',
        'fade-out': 'fade-out 0.2s ease forwards',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16,1,0.3,1) forwards',
        'soft-pulse': 'soft-pulse 2s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 3s linear infinite',
        'gradient-shift': 'gradient-shift 8s ease-in-out infinite',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'mesh-light':
          'radial-gradient(at 40% 20%, rgba(139,92,246,0.15) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(167,139,250,0.1) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(196,181,253,0.12) 0px, transparent 50%)',
        'mesh-dark':
          'radial-gradient(at 40% 20%, rgba(139,92,246,0.12) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(124,58,237,0.08) 0px, transparent 50%), radial-gradient(at 0% 80%, rgba(91,33,182,0.1) 0px, transparent 50%)',
      },
    },
  },
  plugins: [],
};

export default config;
