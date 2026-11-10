'use client';
import { NavegacaoCad } from './NavegacaoCad';
import { NavegacaoClassica } from './NavegacaoClassica';
import type { Papel } from '@/lib/dominio';

/** Escolhe o menu pelo tema do usuário: "CAD" usa o menu novo; os outros temas, o clássico */
export function Navegacao(props: { papel: Papel; nome: string; usuarioId: string; naoLidas: number; sair: () => Promise<void>; tema?: string }) {
  const { tema, ...resto } = props;
  return tema === 'cad' ? <NavegacaoCad {...resto} /> : <NavegacaoClassica {...resto} />;
}
