# Arquitetura — Sistema Integrado de Gestão de Obras

## 1. Visão geral

```
┌──────────────────────────── Navegador / Celular (PWA instalável) ───────────────────────────┐
│  Next.js 15 (React 19, TypeScript, Tailwind)                                                 │
│  • Telas renderizadas no servidor (rápidas em 3G/4G de canteiro)                              │
│  • Server Actions → chamam o banco com a sessão do usuário                                    │
│  • Cliente Supabase no navegador só para: upload de fotos e tempo real (notificações)        │
│  • Service worker: cache de arquivos estáticos + página offline                              │
└───────────────┬──────────────────────────────────────────────────────────────┬──────────────┘
                │ HTTPS (JWT do usuário)                                        │ WebSocket
┌───────────────▼──────────────────────────── Supabase ───────────────────────▼──────────────┐
│  Auth (login e-mail/senha)   Storage (bucket privado "anexos")   Realtime (notificações)      │
│  PostgreSQL 15+                                                                               │
│   • RLS em TODAS as tabelas → isolamento por perfil e por obra                               │
│   • Regras de negócio em funções/gatilhos (fluxos, prazos, auditoria, bloqueio de exclusão)  │
│   • pg_cron: alertas automáticos de hora em hora                                             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Princípio central:** as regras ficam no banco, não na tela. Mesmo que alguém chame a API
diretamente, o PostgreSQL recusa o que a regra não permite (prazo alterado sem justificativa,
encarregado aprovando o próprio serviço, exclusão de histórico, acesso a obra de outra equipe…).

## 2. Fluxo principal

```
ENGENHEIRO planeja ──► cria tarefa (responsável + prazo obrigatórios) ──► notificação ao encarregado
        ▲                                                                         │
        │                                                     ENCARREGADO confirma recebimento
        │                                                                         │
        │                         ┌──── solicita material (vinculado à tarefa) ◄──┤
        │                         ▼                                               │
        │      ENGENHEIRO aprova (se a obra exigir)                           inicia serviço
        │                         ▼                                               │
        │      ALMOXARIFADO verifica estoque ──► parte disponível: separada      atualiza %
        │                         │            └► saldo: item novo p/ COMPRAS     │
        │                         ▼                                               │
        │      COMPRAS: cotação → autorizada → comprado → em transporte          impedimento?
        │      (previsão > necessidade ⇒ ALERTA DE RISCO)                         │
        │                         ▼                                               │
        │      ALMOXARIFADO registra saída (parcial permitida)                    │
        │                         ▼                                               │
        │      ENCARREGADO confirma quantidade recebida (divergência ⇒ alerta)    │
        │                                                                         ▼
        └───────── ENGENHEIRO valida (aprova ou devolve) ◄──── ENCARREGADO informa conclusão
                                   │
                                   ▼
                       DIRETORIA acompanha no painel consolidado
```

### Status da tarefa
| # | Status | Quem leva até ele |
|---|--------|-------------------|
| 1 | Pendente | (reservado para rascunho/sem responsável) |
| 2 | Aguardando confirmação | criação da tarefa / troca de responsável |
| 3 | Programado | encarregado confirma recebimento |
| 4 | Em andamento | encarregado inicia ou retoma |
| 5 | Aguardando material | impedimento com causa "falta de material" |
| 6 | Paralisado | impedimento com "serviço parado" |
| 7 | Concluído pelo encarregado | registrado como evento no histórico |
| 8 | Aguardando validação | automático após a conclusão do encarregado |
| 9 | Aprovado e finalizado | engenheiro aprova |

Situação do prazo (calculada na view `v_tarefas`): **no prazo**, **prazo próximo** (≤ 2 dias),
**atrasado** (data limite passou e o serviço não foi concluído) ou **concluído**.

### Status do material (por item)
Solicitado → Aguardando aprovação → Aprovado → Disponível em estoque **ou** Em cotação →
Compra autorizada → Comprado → Em transporte → Parcialmente entregue → Entregue · (Cancelado).
Cada mudança grava data, hora, usuário e quantidade em `item_eventos`.

## 3. Módulos e telas

| Módulo | Rotas | Perfis |
|---|---|---|
| Login | `/login` | todos |
| Visão gerencial / Painel do engenheiro | `/painel` | diretoria, engenheiro |
| Obras (cadastro, detalhes, etapas, equipe, cronograma Gantt) | `/obras`, `/obras/nova`, `/obras/[id]` | todos (edição: engenheiro/diretoria) |
| Plano de ação (lista, Kanban, calendário, filtros) | `/tarefas` | diretoria, engenheiro |
| Criação/edição de tarefa | `/tarefas/nova`, `/tarefas/[id]/editar` | engenheiro, diretoria |
| Detalhe da tarefa (ações, fotos, materiais, histórico) | `/tarefas/[id]` | todos com acesso |
| Painel do encarregado (celular) | `/campo` | encarregado |
| Solicitação de materiais | `/materiais`, `/materiais/nova` | encarregado, engenheiro |
| Aprovação, estoque, compras, entregas | `/materiais/[id]` | conforme perfil |
| Fila de suprimentos / almoxarifado | `/suprimentos` | compras, almoxarifado, diretoria |
| Usuários e permissões | `/usuarios` | diretoria |
| Central de notificações | `/notificacoes` | todos |
| Alertas (alternativa ao pg_cron) | `/api/cron/alertas` | protegido por segredo |

## 3.1 Planilha da obra, avanço e qualidade

**Planilha da obra** (`/obras/[id]/planilha`): o engenheiro envia o orçamento em Excel (.xlsx/.xls), LibreOffice (.ods) ou CSV.
O leitor (`src/lib/planilha.ts`, roda no navegador) entende a planilha sozinho:
- escolhe a aba certa (prefere "Orçamento/Sintético", evita "BDI/Composições/Cronograma");
- acha a linha de cabeçalho (mesmo com título, logotipo ou cabeçalho em 2 linhas);
- reconhece as colunas Item, Código (SINAPI, ORSE, próprio), Banco, Descrição, Unidade, Quantidade,
  Preço unitário e Total — e prefere a coluna **com BDI** quando existe;
- lê números no padrão brasileiro (`1.234,56`, `R$`), CSV com `;` e arquivos do Excel em Windows-1252;
- separa **grupos/etapas** de **serviços** e monta a hierarquia pela numeração (1 › 1.1 › 1.1.1);
- ignora linhas de título, totais e rodapé, e confere a soma com o "TOTAL GERAL".
Antes de gravar, mostra o que entendeu e permite corrigir o mapeamento. Os grupos principais viram etapas da obra.

**Avanço** (`/obras/[id]/avanco`): cada execução é lançada por item (quantidade, data, local, fotos).
O andamento informado numa tarefa vinculada a um item gera o lançamento automaticamente.
- Lançamento do encarregado entra como "aguardando validação"; o do engenheiro já entra validado.
- Avanço físico-financeiro = Σ (valor do item × % executado validado) ÷ valor total da planilha.
  Sem preços: média física dos serviços. Sem planilha: ponderado pela duração das tarefas.
- Não é possível lançar acima do saldo do item, nem com data futura; nada é apagado.
- Curva de avanço acumulado, avanço por etapa, executado nos últimos 30 dias e registro fotográfico.

**Fotos por categoria**: Execução, Correção, Não conformidade (ou Geral), em tarefas, lançamentos e NCs.

**Não conformidades** (`/qualidade`): registro com gravidade, local, tarefa/item, responsável e prazo →
responsável inicia e informa a correção (exige foto da correção) → engenheiro aceita ou reabre.
Uma tarefa com NC em aberto não pode ser aprovada. NC vencida gera alerta diário.

## 4. Modelo de dados

```
perfis (1:1 auth.users) ─┬─< obra_membros >─┬─ obras ─┬─< etapas
                         │                  │         ├─< tarefas ─┬─< tarefa_eventos   (histórico)
                         │                  │         │            ├─< reprogramacoes   (prazo)
                         │                  │         │            ├─< impedimentos     (causas)
                         │                  │         │            └─< anexos           (fotos)
                         │                  │         ├─< solicitacoes ─< solicitacao_itens ─┬─< item_eventos
                         │                  │         │        (tarefa_id: vínculo imutável)  └─< entregas
                         │                  │         └─< diario_obra ─< diario_tarefas
                         │                  │         ├─< planilhas ─< planilha_itens (grupo/serviço, hierarquia)
                         │                  │         │                      └─< medicoes (execução por item) ─< anexos
                         │                  │         └─< nao_conformidades ─< nc_eventos, anexos (antes/depois)
                         ├─< notificacoes
                         └── auditoria (todas as alterações: antes/depois em JSON)
```

Views de leitura (respeitam o RLS de quem consulta): `v_obras` (avanço físico ponderado pela
duração), `v_tarefas` (situação de prazo, dias de atraso), `v_solicitacoes`, `v_itens`
(risco de atraso, entrega atrasada, necessidade vencida).

## 5. Regras de negócio → onde estão garantidas

| Regra | Implementação |
|---|---|
| 1. Responsável e prazo obrigatórios | `NOT NULL` + `check (fim >= inicio)`; gatilho exige encarregado ativo |
| 2. Encarregado não altera prazo | RLS: encarregado não tem `UPDATE` em tarefas; gatilho bloqueia mudança de data fora de `tarefa_reprogramar` |
| 3. Mudança de prazo com histórico e justificativa | `reprogramacoes` (justificativa ≥ 10 caracteres, causa) + evento no histórico |
| 4. Quem pediu, aprovou e executou | `solicitante_id`, `aprovado_por`, `item_eventos.usuario_id`, `entregas.enviado_por/recebido_por` |
| 5. Histórico não pode ser excluído | gatilho `_tg_bloquear_exclusao` em 14 tabelas; eventos e auditoria imutáveis |
| 6. Entregas parciais | tabela `entregas` (N por item) + status "parcialmente entregue" |
| 7. Pedido vinculado ao serviço | `solicitacoes.tarefa_id` imutável por gatilho |
| 8. Conclusão validada pelo engenheiro | `tarefa_concluir` leva a "aguardando validação"; só `tarefa_validar` (gestor) aprova |
| 9. Data e hora em tudo | `timestamptz default now()` em todas as tabelas |
| 10. Atrasos e causas | `impedimentos.causa`, `reprogramacoes.causa`, `v_tarefas.dias_atraso` |
| 11. Várias obras sem misturar dados | RLS por obra (`membro_obra`, `gere_obra`, `ve_tarefa`) |
| 12. Permissões e segurança | RLS em 17 tabelas; funções internas sem acesso pela API; storage privado por pasta da obra |

## 6. Matriz de permissões

| Ação | Diretoria | Engenheiro | Encarregado | Compras | Almox. |
|---|:-:|:-:|:-:|:-:|:-:|
| Ver obras | todas | vinculadas | vinculadas | todas | todas |
| Cadastrar/editar obra, etapas, equipe | ✓ | as suas | | | |
| Criar/editar tarefa, reprogramar, validar | ✓ | nas suas obras | | | |
| Ver tarefas | todas | das suas obras | as suas* | todas | todas |
| Confirmar, iniciar, andamento, impedimento, concluir, pedir prazo | | | só o responsável | | |
| Solicitar material | ✓ | ✓ | ✓ | | ✓ |
| Aprovar pedido | ✓ | nas suas obras | | | |
| Verificar estoque / registrar envio | ✓ | | | | ✓ |
| Atualizar compra (fornecedor, previsão) | ✓ | | | ✓ | |
| Confirmar recebimento | ✓ | ✓ | ✓ | | |
| Usuários, auditoria, disparar alertas | ✓ | | | | |

\* O encarregado responsável pela obra vê todas as tarefas daquela obra.

## 7. Conexão instável e offline

- Telas leves renderizadas no servidor; fotos reduzidas no celular (máx. 1600 px, JPEG 80%) antes do envio.
- Service worker guarda os arquivos do app e a última versão das páginas visitadas; sem sinal,
  mostra a última cópia ou a página "Sem conexão". O cache é apagado ao sair (celular compartilhado).
- **Próximo passo (offline completo):** fila local (IndexedDB) das ações do encarregado
  (andamento, impedimento, fotos) com envio automático quando a conexão voltar. As funções de fluxo
  já são idempotentes por status, o que facilita a sincronização.

## 8. Segurança, auditoria e LGPD

- Senhas e sessões pelo Supabase Auth; cadastro público desativado (só a diretoria cria contas).
- O papel do usuário é gravado em `app_metadata` (o usuário não consegue alterar) e copiado para `perfis`.
- A chave `service_role` só existe no servidor e só é usada após confirmar que quem chama é administrador.
- `auditoria` registra INSERT/UPDATE/DELETE de 12 tabelas com o antes/depois e o autor.
- LGPD: coleta mínima (nome, e-mail, telefone); acesso restrito por necessidade; desativação em vez
  de exclusão (preserva a rastreabilidade exigida pela obra). Pedido de eliminação de dados pessoais:
  anonimizar `perfis.nome/email/telefone` (o histórico continua íntegro, sem identificar a pessoa).
