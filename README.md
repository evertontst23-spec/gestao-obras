# Gestão de Obras — Sistema Integrado

Planejamento, execução, fiscalização e acompanhamento de várias obras simultâneas.
**Engenheiro planeja → Encarregado recebe → solicita materiais → Engenheiro aprova → Almoxarifado verifica →
Compras providencia → material é entregue → serviço executado → Engenheiro valida → Diretoria acompanha.**

- Stack: Next.js 15 + React 19 + TypeScript + Tailwind · Supabase (PostgreSQL, Auth, Storage, Realtime) · PWA
- Documentação: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) · [`docs/IMPLANTACAO.md`](docs/IMPLANTACAO.md)

## Início rápido
```bash
cp .env.example .env.local   # preencha com os dados do Supabase
npm install
npm run dev
```
Banco: aplique `supabase/migrations/*.sql` (ver docs/IMPLANTACAO.md).
Testes: `npm run test:db` (444 verificações das regras no banco) · `npm run test:planilha` (leitor de planilhas).
Para experimentar a importação: `docs/EXEMPLO_planilha_orcamentaria.xlsx` (dados fictícios).

## Estrutura
```
supabase/
  migrations/
    …0001_schema.sql      tipos, tabelas, funções de permissão, views (prazo, avanço, risco)
    …0002_regras.sql      gatilhos: auditoria, bloqueio de exclusão, proteção de prazo/status, notificações
    …0003_fluxos.sql      funções RPC de cada etapa do fluxo (tarefas, materiais, diário)
    …0004_seguranca.sql   RLS, alertas automáticos (pg_cron), tempo real, storage
    …0005_planilha_avanco_qualidade.sql  planilha, medições, avanço físico-financeiro, fotos por categoria, NCs
    …0007_novos_papeis.sql             perfis Segurança, RH e Financeiro
    …0008_cadastros_suprimentos.sql    funcionários, funções, fornecedores, insumos, estoque por obra, cotações e ordens de compra
    …0009_sst.sql                      ponto facial (hash encadeado), EPI com assinatura/biometria, DDS, ordens de serviço NR-01
    …0010_dp.sql                       espelho de ponto, HE 70%/100%, faltas, atestados, prévia e fechamento da folha
    …0011_financeiro.sql               contrato, contas a pagar/receber, BM com retenções, integração OC/folha, RDO com fotos
    …0012_ponto_rh.sql                 ponto no RH: correção sem apagar o original, link do funcionário, pedidos de correção
    …0013_empregadores.sql             empresa contratante de cada funcionário (CAD, fornecedoras de mão de obra, CLTs de parceiras)
    …0014_pagamentos.sql               pagamentos do RH (dia 20 / dia 05 por empresa) e início do controle de ponto
    …0015_folha_desligados.sql         desligados já acertados saem da folha
    …0016_ponto_externo.sql            empresas com ponto marcado fora do sistema (Ponto Diário)
    …0017_por_obra.sql                 folha e pagamentos por obra (centro de custo), foto do rosto
    …0018_material_codigo.sql          código padronizado no pedido de material e cadastro automático de insumos
    …0019_rdo_frentes.sql              RDO por frentes de serviço; responsável da obra pode ser encarregado, engenheiro ou diretoria
    …0020_locacao_vinculo.sql          pedido de compra ou locação (período e controle de locações), vínculo com tarefa obrigatório, encarregado de campo na tarefa
    …0021_alcada_alertas.sql           alçada de aprovação de compras (coordenador até o limite, acima só diretoria) e alertas de todas as etapas do fluxo
    …0022_estoque_lote.sql             verificação de estoque de vários itens de uma vez
    …0024–0030                         EPI: entrega sem estoque, pendente, assinatura por EPI, anulação, estoque de EPI, quem entregou
    …0031_compras_desfazer.sql         compras: excluir cotação/proposta, voltar para correção, desfazer OC, desfazer pagamento, excluir NF, estornar recebimento (tudo com motivo e histórico)
    …0032_comprovante_pagamento.sql    comprovante de pagamento anexado depois da baixa (contas a pagar/receber)
    …0033_pedido_editar.sql            editar pedido de material (data, prioridade, serviço, observação), editar/renomear item e incluir item
    …0034_cotacao_whatsapp_pagamento.sql forma de pagamento na proposta (vai para a OC), pedido de cotação pelo WhatsApp e PDF/foto do orçamento do fornecedor
    …0035_cotacao_tirar_itens.sql      tirar itens de uma cotação (voltam para a fila) e voltar item da fila para a verificação de estoque
    …0036_alcada_aviso.sql             até o limite, o pedido de aprovação vai só para o coordenador de compras (diretoria só acima do limite)
    …0037_beneficios.sql               RH/DP: benefícios do mês (alimentação e passagem) por obra, editáveis, com total por obra e geral
    …0038_beneficios_lote.sql          benefícios: dias para todos de uma vez e dias a mais marcados como retroativo ou crédito
    …0039_oc_coleta.sql                OC: registrar coleta/saída para entrega (quem, quando, foto) e entrada no estoque também pelo comprador
    …0040_obra_arquivada_nomes.sql     obra arquivada some de todas as telas (Campo do Café); nomes de funcionários sempre em MAIÚSCULAS
  tests/                  27 cenários com 444 verificações (dados de teste prefixados "TESTE")
src/
  middleware.ts           sessão e proteção de rotas
  lib/                    clientes Supabase, sessão, rótulos do domínio, formatação
  components/             UI, formulários, navegação por perfil, Gantt, upload de fotos
  app/
    login/                autenticação
    (app)/painel          visão gerencial / painel do engenheiro
    (app)/obras           cadastro, detalhe, etapas, equipe, cronograma, planilha, avanço e fotos
    (app)/qualidade       não conformidades
    (app)/tarefas         plano de ação (lista, Kanban, calendário), criação, detalhe e fluxo
    (app)/campo           painel do encarregado (celular)
    (app)/materiais       solicitação, aprovação, estoque, compra, entrega, recebimento
    (app)/suprimentos     filas de compras e almoxarifado
    (app)/cadastros       funcionários (dossiê, documentos, biometria), funções, fornecedores, insumos
    (app)/sst             ponto facial, EPI, DDS, ordens de serviço
    (app)/dp              folha, espelho de ponto, horas extras e faltas, atestados, admissões, parâmetros
    (app)/financeiro      fluxo de caixa, contas a pagar/receber, boletins de medição
    (app)/diario          atalho do diário de obra (RDO) — telas em obras/[id]/diario
    (app)/usuarios        usuários e permissões
    (app)/notificacoes    central de alertas
    api/cron/alertas      alternativa ao pg_cron
public/                   manifest, ícone e service worker (PWA)
```

## Situação por etapa
| Etapa | Situação |
|---|---|
| 1. Planejamento técnico | ✅ arquitetura, fluxos, modelagem, regras (docs/ARQUITETURA.md) |
| 2. Interface | ✅ login, painéis, obras, plano de ação (lista/Kanban/calendário), Gantt, tarefas, materiais, suprimentos, usuários, notificações — responsivo e instalável |
| 3. Funcionalidades essenciais | ✅ obras, usuários, tarefas, distribuição, prazos, status, solicitações |
| 4. Integração | ✅ aprovação, estoque (com desmembramento), compras, entregas parciais, recebimento, alertas, indicadores · ⏳ saldo de estoque por material |
| 5. Relatórios e testes | ✅ auditoria, testes do banco · ⏳ relatórios PDF/Excel, testes de interface |
| 6. Implantação | ✅ docs/IMPLANTACAO.md |
| Planilha da obra | ✅ importação inteligente (.xlsx/.xls/.ods/.csv), hierarquia, SINAPI/BDI · ⏳ aditivos (revisão de quantitativos) |
| Avanço físico-financeiro | ✅ lançamentos por item, validação, curva, avanço por etapa, fotos de execução |
| Qualidade | ✅ não conformidades com fotos antes/depois, prazo, verificação, bloqueio de aprovação |
| Diário de obra (RDO) | ✅ registro diário com clima, equipe (sugerida pelo ponto), ocorrências, fotos, validação e impressão |
| Suprimentos completo | ✅ cadastro de insumos, estoque por obra, cotação com 3+ propostas, aprovação da diretoria, OC, NF/boleto, recebimento |
| SST | ✅ ponto facial com GPS e hash, EPI com CA/assinatura, DDS com presença, OS de segurança com ciência |
| Departamento Pessoal | ✅ espelho de ponto, HE 70/100%, DSR, faltas, atestados (LGPD), INSS, prévia e fechamento da folha, exportação Excel |
| Financeiro | ✅ fluxo de caixa, contas a pagar/receber, BM com ISS/INSS/retenção técnica, integração automática com OC e folha, alertas de vencimento |
| Offline completo | ⏳ fila local de ações (base pronta no service worker) |
