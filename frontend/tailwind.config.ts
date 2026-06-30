import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        // Sidebar (leftmost column)
        sidebar: {
          DEFAULT: '#efefef',
          dark: '#1c1c1e',
        },
        // Note list (middle column)
        notelist: {
          DEFAULT: '#f9f9f9',
          dark: '#2c2c2e',
        },
        // Editor (right column)
        editor: {
          DEFAULT: '#ffffff',
          dark: '#1c1c1e',
        },
        // Apple Notes yellow accent
        accent: '#f5a623',
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
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease forwards',
        'fade-out': 'fade-out 0.2s ease forwards',
        'slide-up': 'slide-up 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
      },
    },
  },
  plugins: [],
};

export default config;
