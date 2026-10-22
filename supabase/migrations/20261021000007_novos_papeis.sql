-- =====================================================================
-- 07. NOVOS PERFIS (vindos da plataforma da Construtora FJ)
-- Em arquivo separado: valores novos de enum só podem ser usados após o commit.
-- =====================================================================
alter type papel_usuario add value if not exists 'seguranca';   -- Técnico de Segurança do Trabalho
alter type papel_usuario add value if not exists 'rh';          -- Departamento Pessoal / RH
alter type papel_usuario add value if not exists 'financeiro';  -- Financeiro
