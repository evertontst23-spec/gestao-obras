# Implantação — passo a passo

Tempo estimado: 40 minutos. Custo inicial: R$ 0 (planos gratuitos do Supabase e da Netlify/Vercel
atendem o piloto; para produção com várias obras, recomenda-se o plano Pro do Supabase por causa
dos backups diários e do armazenamento de fotos).

> **Use um projeto Supabase novo e exclusivo para este sistema.** Não aplique estas migrações em
> um banco que já tenha outras tabelas (por exemplo, de outro aplicativo), pois há tabelas com
> nomes comuns como `obras` e `tarefas`.

## 1. Banco de dados (Supabase)

1. Crie o projeto em https://supabase.com → região **South America (São Paulo)**.
2. **Authentication → Sign In / Providers → Email**: mantenha e-mail/senha ligado e **desative
   "Allow new users to sign up"** (apenas a diretoria cria acessos).
3. Aplique as migrações, em ordem, por **um** dos caminhos:
   - **Supabase CLI** (recomendado):
     ```bash
     npm i -g supabase
     supabase login
     supabase link --project-ref SEU_PROJECT_REF
     supabase db push
     ```
   - **SQL Editor** do painel: cole e execute, nesta ordem, os arquivos de `supabase/migrations/`
     (da `…0001` à `…0018`, uma por vez, em ordem de nome).
4. Confira em **Database → Extensions** que `pg_cron` está ativo e em **Integrations → Cron** que
   o job `gerar-alertas-obras` existe. Se a migração avisar que o pg_cron não está disponível,
   ative a extensão e rode no SQL Editor:
   ```sql
   select cron.schedule('gerar-alertas-obras', '5 * * * *', 'select public.gerar_alertas()');
   ```
5. Confira em **Storage** o bucket privado `anexos`. Se as políticas de storage não tiverem sido
   criadas pelo SQL (alguns projetos exigem criar pelo painel), crie em
   **Storage → Policies → anexos** duas políticas para `authenticated`:
   - SELECT: `bucket_id = 'anexos' and public.membro_obra(public.uuid_ou_nulo((storage.foldername(name))[1]))`
   - INSERT: a mesma expressão.

## 2. Primeiro administrador

1. **Authentication → Users → Add user → Create new user**: e-mail e senha da diretoria,
   marque "Auto Confirm User".
2. No **SQL Editor**:
   ```sql
   update public.perfis set papel = 'admin', nome = 'Nome da Diretoria'
    where email = 'diretoria@suaconstrutora.com.br';
   ```
3. A partir daí, todos os demais usuários são criados pela tela **Usuários** do sistema.

## 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` (desenvolvimento) ou cadastre no painel da hospedagem:

| Variável | Onde encontrar | Exposta ao navegador? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL | sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → anon / publishable key | sim (protegida pelo RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role / secret key | **NUNCA** |
| `CRON_SECRET` | gere um valor aleatório longo | não |

## 4. Rodar localmente

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # verificação de produção
```

Testes automatizados das regras de negócio (PostgreSQL local, sem tocar no Supabase):
```bash
npm run test:db        # cria o banco "obras_teste", aplica as migrações e roda 309 verificações
npm run test:planilha  # leitor de planilhas com arquivos no formato SINAPI, CSV brasileiro e .xls
```

## 5. Publicação

### Netlify
1. Envie o projeto para um repositório no GitHub.
2. Netlify → Add new site → Import from Git → selecione o repositório (o Next.js é detectado automaticamente).
3. Site settings → Environment variables: cadastre as 4 variáveis.
4. Deploy. Cada `git push` publica uma nova versão.

### Vercel (alternativa)
Import Project → mesmo repositório → cadastre as variáveis → Deploy.

### Alertas sem pg_cron (opcional)
Agende uma chamada de hora em hora (Netlify Scheduled Functions, Vercel Cron ou cron-job.org):
```
GET https://SEU-DOMINIO/api/cron/alertas
Authorization: Bearer <CRON_SECRET>
```

### Domínio e HTTPS
Configure o domínio próprio (ex.: `obras.suaconstrutora.com.br`) na hospedagem; o HTTPS é automático.
Depois, em Supabase → Authentication → URL Configuration, informe esse domínio como Site URL.

## 6. Backups

- **Plano Pro do Supabase:** backup diário automático (7 dias) e opção de PITR (restauração a qualquer minuto).
- **Cópia própria semanal** (recomendada mesmo no Pro), a partir de qualquer computador com a CLI:
  ```bash
  supabase db dump --linked -f backup_$(date +%F).sql          # estrutura
  supabase db dump --linked --data-only -f dados_$(date +%F).sql
  ```
  Guarde em local separado (ex.: Google Drive da empresa). Teste uma restauração a cada trimestre.
- **Fotos:** o Storage não entra no dump do banco; para cópia, use `supabase storage cp -r ss:///anexos ./anexos`.

## 7. Uso pelos funcionários (treinamento de 15 minutos)

**Instalar no celular:** abrir o endereço no Chrome (Android) → menu ⋮ → "Instalar app" /
no iPhone, Safari → Compartilhar → "Adicionar à Tela de Início". O ícone laranja abre direto no sistema.

**Encarregado** — tela "Minhas tarefas":
1. Chegou tarefa nova → **Confirmar recebimento**.
2. Começou → **Iniciar serviço**.
3. Ao fim do dia → **Atualizar andamento** (% ou quantidade) e **Enviar foto**.
4. Faltou algo → **Solicitar material** (informe quando precisa na obra) ou **Impedimento**.
5. Material chegou → confirme a quantidade recebida no aviso laranja.
6. Terminou → **Concluir serviço** (com foto). O engenheiro valida.
7. **Lançar execução** (obra com planilha): escolha o serviço, informe a quantidade feita e envie as fotos.
8. Recebeu uma **correção** (faixa vermelha no topo)? Abra, refaça, tire a foto da correção e toque em "Informar correção concluída".

**Engenheiro** — na obra, aba **Planilha**: envie o orçamento e confira o que o sistema entendeu antes de confirmar.
Aba **Avanço e fotos**: valide os lançamentos dos encarregados (só o validado entra no avanço).
**Qualidade**: registre não conformidades com foto; verifique as correções. Painel: cartões coloridos mostram atrasos, validações e pedidos para aprovar.
Clique em qualquer número para ver a lista. Prazo só muda em "Reprogramar prazo", com justificativa.

**Compras / Almoxarifado** — tela Suprimentos: filas "Verificar estoque", "Separar e enviar",
"Compras em andamento" e "Risco / atraso". Abra o pedido e registre cada etapa no próprio item.

**Diretoria** — Visão gerencial com todas as obras, desempenho por obra e por encarregado.

## 8. Dependências externas (exigem contratação/credenciais)

| Integração | Situação nesta versão | Alternativa funcional já disponível |
|---|---|---|
| Notificação por **WhatsApp** (API oficial Meta / Z-API / Twilio) | não ativada — exige conta Business e custo por mensagem | Notificações no sistema em tempo real + botão "Compartilhar no WhatsApp" em cada tarefa |
| Notificação por **e-mail** (Resend, SendGrid, SMTP próprio) | não ativada — exige domínio verificado e chave | Central de notificações + contador em tempo real |
| Push no celular (Web Push) | não ativado — exige chaves VAPID | Vibração e contador ao receber alerta com o app aberto |

Ponto de integração previsto: a tabela `notificacoes` recebe todos os alertas; um gatilho ou uma
Edge Function ligada a ela pode repassá-los ao provedor escolhido sem mudar o restante do sistema.

## Módulos da plataforma FJ (migrações 0007 a 0011)
- **0007** precisa ser executada sozinha (novos valores de perfil só valem após o commit).
- Depois de aplicar, cadastre **funções** (salário, carga horária, VA/VT, insalubridade, EPIs) e **funcionários** antes de usar ponto, EPI e folha.
- **Parâmetros do DP**: confira salário mínimo e faixas do INSS a cada janeiro (menu Departamento Pessoal → Parâmetros).
- **Contrato da obra** (aba Financeiro da obra): confira ISS, INSS retido, base de mão de obra, retenção técnica e impostos
  antes da primeira medição — os valores iniciais são padrões comuns, não os do seu contrato.
- Ordens de compra emitidas antes da 0011 viram contas a pagar automaticamente na migração.
- Biometria facial: os modelos são baixados do jsDelivr no primeiro uso; o consentimento (LGPD) é obrigatório e fica registrado.
