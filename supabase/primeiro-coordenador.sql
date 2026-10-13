-- =====================================================================
-- Rotas do CD: cria o seu acesso de coordenação (faça uma única vez).
--
-- ANTES de rodar este arquivo:
--   1. No Supabase, abra Authentication > Users > Add user > Create new user.
--   2. Em Email, digite:   SEU-USUARIO@cd.example.com
--      (troque SEU-USUARIO pelo usuário que você vai usar para entrar;
--       use só letras minúsculas, números, ponto, hífen ou sublinhado)
--   3. Digite uma senha e MARQUE "Auto Confirm User". Clique em Create user.
--
-- Depois: troque os dois textos entre aspas abaixo (SEU-USUARIO e Seu Nome)
-- e rode no SQL Editor.
-- =====================================================================

insert into public.profiles (id, username, full_name, role)
select id, 'SEU-USUARIO', 'Seu Nome', 'coord'
from auth.users
where email = 'SEU-USUARIO@cd.example.com';

-- Deve aparecer "1 row affected" (ou "Success. 1 row"). Se aparecer 0 linhas,
-- o e-mail digitado no passo 2 está diferente do que está acima.
