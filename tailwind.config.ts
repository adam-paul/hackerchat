// tailwind.config.ts

import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4A154B',
          light: '#611f69',
          dark: '#3B1139',
        },
      },
      keyframes: {
        'theme-reject': {
          '0%, 100%': { transform: 'translateX(0.25rem)' },
          '20%': { transform: 'translateX(1.5rem)' },
          '40%': { transform: 'translateX(0.5rem)' },
          '60%': { transform: 'translateX(1rem)' },
          '80%': { transform: 'translateX(0.25rem)' },
        },
      },
      animation: {
        'theme-reject': 'theme-reject 1s ease-in-out',
      },
    },
  },
  plugins: [],
}

export default config