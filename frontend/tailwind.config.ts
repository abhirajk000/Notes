import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-outfit)', 'Outfit', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: '#f7f5fb',
          dark: '#141218',
        },
        sidebar: {
          DEFAULT: '#f0edf5',
          dark: '#1a1720',
        },
        notelist: {
          DEFAULT: '#faf9fc',
          dark: '#1e1b26',
        },
        editor: {
          DEFAULT: '#ffffff',
          dark: '#141218',
        },
        accent: {
          DEFAULT: '#9333ea',
          light: '#a855f7',
          dark: '#7e22ce',
          muted: '#f3e8ff',
          'muted-dark': '#2e1a47',
        },
        brand: {
          DEFAULT: '#9333ea',
          soft: '#ede9fe',
          deep: '#4c1d95',
        },
      },
      boxShadow: {
        soft: '0 2px 16px rgba(76, 29, 149, 0.06)',
        'soft-md': '0 4px 24px rgba(76, 29, 149, 0.08)',
        'soft-lg': '0 8px 40px rgba(76, 29, 149, 0.1)',
        'soft-inset': 'inset 0 1px 2px rgba(76, 29, 149, 0.04)',
        glow: '0 0 24px rgba(147, 51, 234, 0.15)',
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
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'soft-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease forwards',
        'fade-out': 'fade-out 0.2s ease forwards',
        'slide-up': 'slide-up 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
        'soft-pulse': 'soft-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
