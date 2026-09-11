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