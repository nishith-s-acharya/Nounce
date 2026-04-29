import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        midnight: '#1C1C1E',
        'midnight-elev': '#26262A',
        'midnight-deep': '#141416',
        neon: {
          green: '#39FF14',
          pink: '#FF2D95',
          cyan: '#00E5FF',
          amber: '#FFB400',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'neon-green': '0 0 12px rgba(57, 255, 20, 0.35)',
        'neon-pink': '0 0 12px rgba(255, 45, 149, 0.35)',
        'neon-cyan': '0 0 12px rgba(0, 229, 255, 0.35)',
      },
      keyframes: {
        'pulse-neon': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'pulse-neon': 'pulse-neon 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
