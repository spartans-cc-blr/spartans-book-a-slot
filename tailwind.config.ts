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
          DEFAULT: '#C9A84C',
          light: '#E8C97A',
          dim: '#7A6030',
          glow: 'rgba(201,168,76,0.15)',
        },
        crimson: {
          DEFAULT: '#C0132C',
          dark: '#8B0000',
        },
        ink: {
          DEFAULT: '#080808',
          2: '#111111',
          3: '#1A1A1A',
          4: '#242424',
          5: '#2E2E2E',
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
