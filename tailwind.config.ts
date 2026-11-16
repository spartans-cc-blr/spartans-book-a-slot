import type { Config } from 'tailwindcss'

const config: Config = {
  // Light/Dark/System theming (see ui-theme.md "Light/Dark/System"):
  // ThemeProvider sets data-theme="dark"|"light" on <html>. Only components
  // that opt in with an explicit `dark:` class respond — every page/component
  // that hasn't been touched keeps rendering exactly as it always has.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#F59E0B',
          light: '#FBBF24',
          dim: '#B45309',
          glow: 'rgba(245,158,11,0.15)',
        },
        crimson: {
          DEFAULT: '#DC2626',
          dark: '#B91C1C',
        },
        ink: {
          DEFAULT: '#02040A',
          2: '#0A0A0A',
          3: '#121214',
          4: '#18181B',
          5: '#27272A',
        },
        parchment: {
          DEFAULT: '#F8F4EE',
          2: '#EEEAE2',
          3: '#E2DACE',
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