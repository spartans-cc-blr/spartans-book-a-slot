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
          DEFAULT: '#8B5E1A',
          light: '#B07D2A',
          dim: '#C9A84C',
          glow: 'rgba(139,94,26,0.12)',
        },
        crimson: {
          DEFAULT: '#B01020',
          dark: '#7A0010',
        },
        ink: {
          DEFAULT: '#1A1208',
          2: '#2C2010',
          3: '#3D3018',
          4: '#EDE0C4',
          5: '#D6C8A8',
        },
parchment: {
    DEFAULT: '#F5EDD8',     // page background
    2: '#EDE0C4',           // card surface
    3: '#E0CFA8',           // slightly deeper card
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
