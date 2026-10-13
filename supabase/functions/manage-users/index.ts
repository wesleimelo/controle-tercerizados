// Função "manage-users": cria motoristas, redefine senhas e ativa ou desativa acessos.
// Só a coordenação pode chamar. Roda no servidor do Supabase, onde fica a chave secreta.
// Publique no painel do Supabase: Edge Functions > Deploy a new function > Via Editor,
// com o nome exato manage-users, e cole este arquivo.

import { createClient } from 'npm:@supabase/supabase-js@2';

// Precisa ser igual ao LOGIN_DOMAIN do arquivo config.js.
const LOGIN_DOMAIN = 'cd.example.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status?: number) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Quem está chamando?
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    });
    const { data: who } = await caller.auth.getUser();
    const user = who && who.user;
    if (!user) return json({ error: 'Sessão inválida. Entre de novo.' }, 401);

    // É coordenação ativa?
    const admin = createClient(url, service);
    const { data: me } = await admin
      .from('profiles').select('role, active').eq('id', user.id).maybeSingle();
    if (!me || me.role !== 'coord' || !me.active) {
      return json({ error: 'Só a coordenação pode fazer isso.' }, 403);
    }

    const body = await req.json();
    const action = body.action;

    if (action === 'create_driver') {
      const username = String(body.username || '').trim().toLowerCase();
      const fullName = String(body.full_name || '').trim();
      const password = String(body.password || '');
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
        return json({ error: 'O usuário precisa ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.' });
      }
      if (fullName.length < 2 || fullName.length > 60) {
        return json({ error: 'Informe o nome completo do motorista.' });
      }
      if (password.length < 6 || password.length > 72) {
        return json({ error: 'A senha precisa ter de 6 a 72 caracteres.' });
      }
      const { data: dup } = await admin
        .from('profiles').select('id').eq('username', username).maybeSingle();
      if (dup) return json({ error: 'Esse usuário já existe.' });

      const created = await admin.auth.admin.createUser({
        email: username + '@' + LOGIN_DOMAIN,
        password: password,
        email_confirm: true,
      });
      if (created.error || !created.data || !created.data.user) {
        return json({ error: 'Não foi possível criar o acesso: ' + (created.error ? created.error.message : 'erro desconhecido') });
      }
      const ins = await admin.from('profiles').insert({
        id: created.data.user.id,
        username: username,
        full_name: fullName,
        role: 'driver',
      });
      if (ins.error) {
        await admin.auth.admin.deleteUser(created.data.user.id);
        return json({ error: 'Não foi possível salvar o motorista.' });
      }
      return json({ ok: true, id: created.data.user.id });
    }

    if (action === 'reset_password') {
      const password = String(body.password || '');
      if (!body.user_id) return json({ error: 'Motorista não informado.' });
      if (password.length < 6 || password.length > 72) {
        return json({ error: 'A senha precisa ter de 6 a 72 caracteres.' });
      }
      const upd = await admin.auth.admin.updateUserById(body.user_id, { password: password });
      if (upd.error) return json({ error: 'Não foi possível redefinir a senha.' });
      return json({ ok: true });
    }

    if (action === 'set_active') {
      if (!body.user_id) return json({ error: 'Motorista não informado.' });
      const active = body.active === true;
      if (!active && body.user_id === user.id) {
        return json({ error: 'Você não pode desativar o seu próprio acesso.' });
      }
      const upd = await admin.from('profiles').update({ active: active }).eq('id', body.user_id);
      if (upd.error) return json({ error: 'Não foi possível alterar o acesso.' });
      // Bloqueia também o login no serviço de autenticação.
      await admin.auth.admin.updateUserById(body.user_id, { ban_duration: active ? 'none' : '876000h' });
      return json({ ok: true });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return json({ error: 'Erro inesperado. Tente de novo.' }, 500);
  }
});
