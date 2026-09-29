# tipsterVIP — setup

Site de acesso VIP do **Elite Tipsters EPC** (login Telegram + pagamento Stripe +
link automático para o grupo privado do Telegram), com o tema visual do
"Tipster do Pedrito" (dourado + esmeralda, private club).

Stack: Vite + React + TypeScript no frontend; `api/*.js` como Vercel
Serverless Functions no backend (Node, sem framework). Sem servidor próprio —
corre em `vercel dev` ou já deployado na Vercel.

## 1. Instalar dependências

```
npm install
```

## 2. Supabase (novo projeto)

1. Cria um projeto novo em https://supabase.com/dashboard.
2. SQL Editor → corre o conteúdo de `supabase-schema.sql` (cria as tabelas
   `subscriptions` e `invite_links`, RLS ligado, sem policies — só o
   service-role key tem acesso).
3. Project Settings → API → copia `Project URL` e a `service_role` key
   (não a `anon` key) para `.env.local` (`VITE_SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY`).

## 3. Telegram — bot novo dedicado a este site

✅ Já feito: bot criado no @BotFather, `BOT_TOKEN` e `TELEGRAM_CLIENT_ID` /
`VITE_TELEGRAM_CLIENT_ID` já estão em `.env.local`.

Falta:

1. `/setdomain` no @BotFather → escolhe o teu bot → indica o domínio onde este
   site vai estar publicado (ex: `elitetipsters.vercel.app`). Sem isto o
   widget de login do Telegram não aparece / não funciona.
2. Cria o **grupo/canal privado do VIP** no Telegram, adiciona o bot como
   **administrador** com permissão de "Convidar utilizadores via link" **e**
   de "Banir/remover utilizadores" (esta segunda é precisa para o kick
   automático — passo 8).
3. Obtém o **ID do grupo** (número negativo, ex: `-1001234567890`) —
   encaminha uma mensagem do grupo para @userinfobot, ou usa
   `getUpdates`/`getChat` da API do bot. Guarda em `NEW_GROUP_ID` no
   `.env.local`.

## 4. Stripe

✅ Já feito: usa a **mesma conta Stripe do FOOTMILLION VIP** (live) —
`STRIPE_SECRET_KEY` já está em `.env.local`. Não é preciso criar
Produtos/Preços no dashboard — o checkout cria os `price_data` on-the-fly a
partir de `api/_lib/plans.js` (cêntimos: 1999 / 4999 / 15999 = 19,99€ /
49,99€ / 159,99€).

Falta: este site tem o seu **próprio endpoint de webhook** (URL diferente do
footmillion), por isso precisa de um Signing secret novo — não dá para
reutilizar o `whsec_` do footmillion.

1. Developers → Webhooks → Add endpoint (na mesma conta Stripe):
   - URL: `https://<o-teu-dominio>/api/webhook`   (⚠️ tem de ser exatamente
     este path, terminar em `/api/webhook`)
   - Evento: `checkout.session.completed`
   - Copia o **Signing secret** → `STRIPE_WEBHOOK_SECRET` no `.env.local`.

## 5. Sessão

✅ Já feito: `SESSION_SECRET` já foi gerado e está em `.env.local`.

## 6. Correr localmente

```
cp .env.example .env.local   # e preenche tudo
npx vercel dev                # corre frontend + api juntos na porta 3000
```

(`npm run dev` sozinho só serve o frontend — as chamadas a `/api/*` precisam
do `vercel dev` a correr, por causa do proxy em `vite.config.ts`.)

## 7. Deploy

```
vercel --prod
```

Configura as mesmas variáveis de ambiente do `.env.local` no dashboard da
Vercel (Project Settings → Environment Variables) antes do deploy, e volta ao
passo 3.1 e 4.4 para confirmar que o domínio final da Vercel está registado
no BotFather e no webhook do Stripe.

## 8. Kick automático de membros expirados

O site em si só gera links de convite — não há aqui um processo 24/7 a
expulsar quem deixa de pagar. Isso é feito por um script Python separado,
`kick-bot/`, que corre uma vez por dia no PythonAnywhere (o mesmo padrão do
`scheduler.py` que já usas no footmillion). Ver `kick-bot/README.md` para o
setup completo — precisa do mesmo `BOT_TOKEN`/`NEW_GROUP_ID` deste `.env.local`
e da `service_role` key do mesmo projeto Supabase.
