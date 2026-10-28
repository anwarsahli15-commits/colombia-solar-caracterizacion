import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: { DEFAULT: '#0b4ea2', oscuro: '#083a7a', claro: '#e8f0fa' },
        verde: { DEFAULT: '#1f9a4a', claro: '#e7f5ec' },
        sol: { DEFAULT: '#e8ad4c', claro: '#fbf3e3', oscuro: '#8a5a12' },
        tinta: '#1b2430',
      },
      fontFamily: { sans: ['Carlito', 'Calibri', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
