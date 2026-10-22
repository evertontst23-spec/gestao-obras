-- Fixa search_path das funções auxiliares (recomendação do Security Advisor do Supabase)
alter function public._fluxo_off() set search_path = public;
alter function public._fluxo_on() set search_path = public;
alter function public.hoje() set search_path = public;
alter function public._cod_sm(bigint) set search_path = public;
alter function public._cod_tarefa(bigint) set search_path = public;
alter function public._exige_responsavel(public.tarefas) set search_path = public;
alter function public._tg_auditoria_imutavel() set search_path = public;
alter function public._tg_atualizado_em() set search_path = public;
alter function public.uuid_ou_nulo(text) set search_path = public;
alter function public._tg_bloquear_exclusao() set search_path = public;
alter function public._tg_solicitacoes_antes() set search_path = public;
