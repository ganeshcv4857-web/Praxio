/** @type {import('tailwindcss').Config} */
// Colours resolve to CSS variables (src/theme-palette.css) so every screen follows the Praxio theme.
const FAMILIES = ['slate', 'indigo', 'emerald', 'amber', 'rose', 'violet'];
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
const themed = Object.fromEntries(FAMILIES.map((f) => [f, Object.fromEntries(SHADES.map((s) => [s, v(`${f}-${s}`)]))]));

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Geist"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      colors: { ...themed, white: v('white'), 'on-accent': v('on-accent') },
    },
  },
  plugins: [],
};
