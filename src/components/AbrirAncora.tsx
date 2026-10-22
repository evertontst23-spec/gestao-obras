'use client';
import { useEffect } from 'react';

/** Abre o bloco <details> indicado no endereço (#impedimento, #concluir…) — atalho dos botões do celular. */
export function AbrirAncora() {
  useEffect(() => {
    const abrir = () => {
      const el = document.getElementById(location.hash.slice(1));
      if (el instanceof HTMLDetailsElement) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    };
    abrir();
    window.addEventListener('hashchange', abrir);
    return () => window.removeEventListener('hashchange', abrir);
  }, []);
  return null;
}
