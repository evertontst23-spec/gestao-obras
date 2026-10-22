import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta de canteiro: concreto + laranja de sinalização
        concreto: { 50: '#f6f6f5', 100: '#ebeae7', 200: '#d6d4cf', 300: '#b5b2aa', 400: '#8d897f', 500: '#6f6b62', 600: '#57544d', 700: '#45433e', 800: '#2e2d2a', 900: '#1d1c1a' },
        sinal: { 50: '#fff5ed', 100: '#ffe7d4', 400: '#ff8a3d', 500: '#f26b1d', 600: '#d95510', 700: '#b34210' },
        ok: { 50: '#ecfdf3', 100: '#bbf7d0', 500: '#16a34a', 700: '#15803d' },
        atencao: { 50: '#fffbeb', 100: '#fef3c7', 500: '#d97706', 700: '#b45309', 800: '#92400e' },
        atraso: { 50: '#fef2f2', 100: '#fecaca', 500: '#dc2626', 700: '#b91c1c' },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
