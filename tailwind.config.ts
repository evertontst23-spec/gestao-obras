import type { Config } from 'tailwindcss';

// As cores são variáveis CSS: cada tema (claro, escuro, petróleo) define os valores em globals.css
const v = (nome: string, tons: number[]) => Object.fromEntries(tons.map((t) => [t, `rgb(var(--${nome}-${t}) / <alpha-value>)`]));

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        concreto: v('concreto', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        sinal: v('sinal', [50, 100, 300, 400, 500, 600, 700, 800]),
        ok: v('ok', [50, 100, 500, 600, 700, 800]),
        atencao: v('atencao', [50, 100, 200, 500, 700, 800]),
        atraso: v('atraso', [50, 100, 200, 300, 500, 600, 700]),
        info: v('info', [50, 500, 700]),
        superficie: 'rgb(var(--superficie) / <alpha-value>)',
        elevada: 'rgb(var(--elevada) / <alpha-value>)',
        menu: {
          fundo: 'rgb(var(--menu-fundo) / <alpha-value>)', texto: 'rgb(var(--menu-texto) / <alpha-value>)',
          mudo: 'rgb(var(--menu-mudo) / <alpha-value>)', hover: 'rgb(var(--menu-hover) / <alpha-value>)',
          ativo: 'rgb(var(--menu-ativo) / <alpha-value>)', 'ativo-texto': 'rgb(var(--menu-ativo-texto) / <alpha-value>)',
          borda: 'rgb(var(--menu-borda) / <alpha-value>)', marca: 'rgb(var(--menu-marca) / <alpha-value>)',
        },
      },
      borderRadius: { md: 'var(--raio-md)', lg: 'var(--raio-lg)', xl: 'var(--raio-xl)' },
      boxShadow: { cartao: 'var(--sombra)' },
      fontFamily: {
        sans: ['var(--fonte)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        // números em fonte normal com algarismos alinhados (antes era monoespaçada)
        mono: ['var(--fonte)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
