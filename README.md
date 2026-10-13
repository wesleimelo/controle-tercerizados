# Rotas do CD

Sistema para os motoristas do CD iniciarem e finalizarem a rota informando o km do painel e a foto do odômetro. Funciona no celular, pelo navegador.

São duas páginas separadas:

| Página | Quem usa | O que faz |
|---|---|---|
| `index.html` | Motoristas | Entram com usuário e senha, iniciam e finalizam a rota, veem as próprias rotas |
| `coordenacao.html` | Coordenação | Painel do dia, histórico com fotos, resumo do mês, planilha CSV, cadastro de motoristas e veículos |

## Quem pode o quê

| | Motorista | Coordenação |
|---|---|---|
| Iniciar e finalizar a própria rota | Sim | Sim |
| Finalizar a rota de outra pessoa | Não | Sim |
| Ver as rotas e fotos dos outros | Não | Sim |
| Corrigir km, excluir rota | Não | Sim |
| Cadastrar motoristas, redefinir senhas, desativar acessos | Não | Sim |
| Cadastrar e editar veículos | Não | Sim |

Isso é garantido no banco de dados, e não só escondido na tela. Um motorista que tentasse chamar o sistema por fora também seria barrado.

O login é só **usuário e senha**, sem e-mail. Quem cadastra os usuários é você, na página da coordenação.

---

## Passo a passo para publicar

Você vai usar duas contas gratuitas: **Supabase** (guarda os dados e as fotos) e **GitHub** (publica as páginas). Reserve cerca de 30 minutos.

### 1. Criar o projeto no Supabase

1. Entre em supabase.com, crie a conta e clique em **New project**.
2. Dê um nome (por exemplo `rotas-cd`), crie uma senha forte para o banco e guarde-a. Em região, escolha **South America (São Paulo)**.
3. Espere o projeto terminar de criar (cerca de 2 minutos).

### 2. Criar as tabelas

1. No menu da esquerda, abra **SQL Editor** e clique em **New query**.
2. Abra o arquivo `supabase/schema.sql`, copie **tudo** e cole no editor.
3. Clique em **Run**. Deve aparecer "Success".

Isso cria as tabelas, as regras de acesso, o espaço das fotos e os três veículos iniciais (SEY, UBG e UCI, com a placa incompleta, que você corrige depois).

### 3. Criar o seu acesso de coordenação

1. Menu **Authentication → Users → Add user → Create new user**.
2. Em Email, digite `seu.usuario@cd.example.com`, trocando `seu.usuario` pelo usuário que você quer usar para entrar (letras minúsculas, números, ponto, hífen ou sublinhado). Esse e-mail é só um formato interno: nenhuma mensagem é enviada.
3. Digite uma senha, **marque "Auto Confirm User"** e clique em **Create user**.
4. Volte ao **SQL Editor**, abra o arquivo `supabase/primeiro-coordenador.sql`, troque `SEU-USUARIO` (nas duas linhas) e `Seu Nome` e rode.

### 4. Impedir cadastro por conta própria

Em **Authentication**, procure a opção **Allow new users to sign up** (fica em Sign In / Providers) e **desligue**. Assim só você cria acessos.

### 5. Publicar a função que cadastra motoristas

1. Menu **Edge Functions → Deploy a new function → Via Editor**.
2. Dê exatamente o nome `manage-users`.
3. Apague o texto de exemplo, abra `supabase/functions/manage-users/index.ts`, copie tudo e cole.
4. Clique em **Deploy**.

### 6. Copiar as chaves para o `config.js`

1. Menu **Project Settings → API** (ou **API Keys**).
2. Copie o **Project URL** e a chave pública (**anon** ou **publishable**).
3. Abra o `config.js` e troque `https://SEU-PROJETO.supabase.co` e `COLE-AQUI-A-CHAVE-PUBLICA`.

> **Nunca** cole a chave `service_role` (secreta) nesse arquivo. A chave pública pode ficar à vista: quem protege os dados são as regras de acesso do passo 2.

Se você mudar o `cd.example.com` (não precisa), troque também em `config.js` (`LOGIN_DOMAIN`), em `manage-users/index.ts` e nos e-mails do passo 3. Tem de ser igual nos três.

### 7. Publicar as páginas no GitHub

1. Entre em github.com e crie um repositório **público** (por exemplo `rotas-cd`). O plano gratuito só publica páginas a partir de repositório público.
2. Envie os arquivos `index.html`, `coordenacao.html`, `common.js`, `motorista.js`, `coordenacao.js`, `style.css` e `config.js` (botão **Add file → Upload files**). A pasta `supabase` pode ir junto ou ficar só com você.
3. Abra **Settings → Pages**, em **Build and deployment** escolha **Deploy from a branch**, branch `main` e pasta `/ (root)`, e clique em **Save**.
4. Em alguns minutos o endereço aparece no topo da mesma tela, algo como `https://seu-usuario.github.io/rotas-cd/`.

Endereços finais:
- Motoristas: `https://seu-usuario.github.io/rotas-cd/`
- Coordenação: `https://seu-usuario.github.io/rotas-cd/coordenacao.html`

### 8. Configurar e testar

1. Abra a página da coordenação e entre com o seu usuário.
2. Aba **Veículos**: abra cada um, complete a placa e troque o nome (por exemplo "Van 1", "Van 2", "Caminhão") e salve.
3. Aba **Motoristas**: cadastre cada motorista com nome, usuário e uma senha. **Anote a senha para entregar a ele**: ela não pode ser consultada depois, só redefinida.
4. No celular, abra o endereço dos motoristas, entre com um motorista de teste e faça uma rota completa (iniciar, finalizar). Confira o resultado no Histórico da coordenação e depois exclua a rota de teste.

---

## Uso no dia a dia

**Motorista**
1. Abre o endereço e entra (o navegador pode guardar o login).
2. Toca no veículo, digita o km do painel, tira a foto do odômetro e toca em **Iniciar rota**.
3. No fim do dia toca no mesmo veículo, digita o km final, tira a foto e toca em **Finalizar rota**. Pode escrever uma observação.
4. Errou o km ao iniciar? Dentro da rota aberta há **Errei o início: cancelar esta rota**.

A hora da saída e da chegada é a do servidor, e não a do celular. A foto também leva data e hora escritas no canto.

**Coordenação**
- **Painel:** quem está em rota agora, rotas do dia, km do mês.
- **Histórico:** filtros por mês, veículo e motorista, fotos, correção de km e planilha CSV.
- **Resumo:** km e número de rotas por veículo e por motorista em cada mês.
- **Rota que ficou aberta:** um motorista não finaliza a rota de outro. Para fechar uma rota esquecida, entre com o seu usuário de coordenação na página dos motoristas (`index.html`), toque no veículo e finalize. Se a rota nem deveria existir, exclua-a no Histórico da coordenação.

## Cuidados

- **Senhas:** o sistema pede no mínimo 6 caracteres. Use senhas que o motorista não repita em outros lugares e redefina quando alguém sair da empresa (ou desative o acesso).
- **Repositório público:** quem encontrar o endereço vê as telas, mas não vê nenhum dado sem entrar.
- **Plano gratuito do Supabase:** o projeto pode ser pausado depois de cerca de uma semana sem nenhum uso (é só reativar no painel), o espaço das fotos é de 1 GB (cada foto fica em torno de 100 KB, então comporta milhares) e não há cópia de segurança para baixar. Baixe a planilha CSV todo mês.

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| "O sistema ainda não foi configurado" | O `config.js` ainda tem os textos de exemplo. Refaça o passo 6 |
| "Usuário ou senha incorretos" | Confira o usuário (minúsculas, sem espaço). A coordenação pode redefinir a senha |
| "Este acesso está desativado" | A coordenação desativou o acesso. Reative na aba Motoristas |
| "Esta área é só para a coordenação" | O usuário é de motorista. Use a página `index.html` |
| Erro ao cadastrar motorista | A função `manage-users` não foi publicada ou o nome está diferente (passo 5) |
| "Failed to fetch" ou "Sem conexão" | Sem internet no celular, ou a URL no `config.js` está errada |
| Página em branco no GitHub | Espere alguns minutos depois de ativar o Pages e recarregue |
