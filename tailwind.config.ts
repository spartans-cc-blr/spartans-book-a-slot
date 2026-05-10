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
  gold: {
    DEFAULT: '#D97706',     // amber-600 — saffron, works on light bg
    light: '#F59E0B',       // amber-400 — hover states
    dim: '#B45309',         // amber-700 — headings, labels
    glow: 'rgba(217,119,6,0.12)',
  },
  crimson: {
    DEFAULT: '#DC2626',     // red-600
    dark: '#B91C1C',        // red-700
  },
  ink: {
    DEFAULT: '#1C1917',     // stone-950 — primary text
    2: '#292524',           // stone-900
    3: '#44403C',           // stone-700 — secondary text
    4: '#EEEAE2',           // card surface
    5: '#D4C9B0',           // borders / dividers
  },
  parchment: {
    DEFAULT: '#F8F4EE',     // page background
    2: '#EEEAE2',           // card bg
    3: '#E2DACE',           // deeper card / input bg
  },
},

      fontFamily: {
        cinzel: ['Cinzel', 'serif'],
        rajdhani: ['Rajdhani', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
