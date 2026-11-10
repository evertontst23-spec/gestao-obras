import { obterSessao } from '@/lib/sessao';
import { Cabecalho } from '@/components/ui';
import { FormAcao, Botao } from '@/components/formulario';
import { escolherTema } from './acoes';

export const metadata = { title: 'Aparência' };

const TEMAS = [
  { id: 'claro', nome: 'Claro e arejado', desc: 'Fundo claro, cantos arredondados, menu branco. Leve e moderno.',
    menu: '#FFFFFF', menuBorda: '#E8EAEE', fundo: '#F4F5F7', cartao: '#FFFFFF', texto: '#111827', mudo: '#9AA1AC', destaque: '#EA580C', ativo: '#FFF1E7' },
  { id: 'escuro', nome: 'Escuro premium', desc: 'Tela grafite com destaques em laranja. Cansa menos a vista à noite.',
    menu: '#0E131C', menuBorda: '#1C2330', fundo: '#0A0E15', cartao: '#121824', texto: '#F3F5F8', mudo: '#6B7385', destaque: '#F97316', ativo: '#1F2736' },
  { id: 'petroleo', nome: 'Corporativo petróleo', desc: 'Menu verde-petróleo, conteúdo claro e tabelas mais densas.',
    menu: '#0C3438', menuBorda: '#1A4A4F', fundo: '#EEF2F4', cartao: '#FFFFFF', texto: '#0F1F24', mudo: '#8597A0', destaque: '#EA580C', ativo: '#FFFFFF' },
  { id: 'cad', nome: 'CAD — novo modelo', desc: 'Preto e cinzas neutros, menu novo com módulos recolhíveis e a nova tela de Pagamentos.',
    menu: '#000000', menuBorda: '#1F1F1F', fundo: '#000000', cartao: '#161616', texto: '#EDEDED', mudo: '#878787', destaque: '#F48A32', ativo: '#1A1A1A' },
] as const;

export default async function Aparencia() {
  const { perfil } = await obterSessao();
  const atual = perfil.tema ?? 'claro';
  return (
    <>
      <Cabecalho titulo="Aparência" sub="Escolha o visual do sistema. Vale só para o seu usuário, em qualquer aparelho." />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {TEMAS.map((t) => (
          <FormAcao key={t.id} acao={escolherTema} className={`overflow-hidden rounded-xl border-2 bg-superficie shadow-cartao ${atual === t.id ? 'border-sinal-500' : 'border-concreto-200'}`}>
            <input type="hidden" name="tema" value={t.id} />
            <div aria-hidden className="flex h-40 border-b border-concreto-200" style={{ background: t.fundo }}>
              <div className="flex w-1/4 flex-col gap-1.5 p-2" style={{ background: t.menu, borderRight: `1px solid ${t.menuBorda}` }}>
                <div className="h-4 w-4 rounded" style={{ background: t.destaque }} />
                <div className="mt-1 h-2 rounded" style={{ background: t.mudo, opacity: 0.5 }} />
                <div className="h-3 rounded" style={{ background: t.ativo, outline: `1px solid ${t.destaque}55` }} />
                <div className="h-2 rounded" style={{ background: t.mudo, opacity: 0.5 }} />
                <div className="h-2 rounded" style={{ background: t.mudo, opacity: 0.5 }} />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="h-3 w-1/2 rounded" style={{ background: t.texto, opacity: 0.85 }} />
                <div className="grid grid-cols-3 gap-1.5">
                  {[0, 1, 2].map((k) => <div key={k} className="h-10 rounded-md p-1.5" style={{ background: t.cartao, border: `1px solid ${t.menuBorda}` }}><div className="h-1.5 w-2/3 rounded" style={{ background: t.mudo }} /><div className="mt-1.5 h-2.5 w-full rounded" style={{ background: k === 0 ? t.destaque : t.texto, opacity: 0.85 }} /></div>)}
                </div>
                <div className="flex-1 rounded-md" style={{ background: t.cartao, border: `1px solid ${t.menuBorda}` }} />
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div><b className="text-base">{t.nome}</b><p className="mt-0.5 text-sm text-concreto-500">{t.desc}</p></div>
              {atual === t.id
                ? <div className="rounded-md bg-sinal-50 px-3 py-2 text-center text-sm font-semibold text-sinal-700">Em uso</div>
                : <Botao className="w-full">Usar este visual</Botao>}
            </div>
          </FormAcao>
        ))}
      </div>
    </>
  );
}
