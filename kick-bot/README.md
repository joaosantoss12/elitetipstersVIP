# kick-bot — remoção automática de membros expirados

Script diário (não é um servidor) que corre no PythonAnywhere: expulsa do
grupo VIP quem já passou da data de expiração e avisa por DM quem está a
`RENEWAL_WARNING_DAYS` dias de expirar. É a versão adaptada do
`scheduler.py` que já usas no `GESTAO VIP TELEGRAM BOT` (footmillion),
apontada ao bot e ao Supabase novos deste site.

## Setup no PythonAnywhere

1. **Files** → carrega esta pasta (`config.py`, `database.py`, `bot.py`,
   `scheduler.py`, `requirements.txt`) para uma pasta nova, ex:
   `~/elitetipsters-kickbot/`.
2. **Consoles** → Bash:
   ```
   cd ~/elitetipsters-kickbot
   python3.11 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. Cria o `.env` nessa pasta (copia de `.env.example` e preenche):
   - `BOT_TOKEN` — o mesmo bot do site (`.env.local` do tipsterVIP).
   - `GROUP_ID` — o mesmo `NEW_GROUP_ID` do site. O bot tem de ser admin do
     grupo com permissão de **remover membros** (não só convidar).
   - `SUPABASE_URL` / `SUPABASE_KEY` — o mesmo projeto Supabase do site,
     com a `service_role` key (a mesma que está em `SUPABASE_SERVICE_KEY`).
   - `SITE_URL` — domínio público do site (para o botão "Renovar VIP").
4. **Tasks** → Add a new task → Daily, à hora que preferires:
   ```
   python3.11 /home/<user>/elitetipsters-kickbot/scheduler.py
   ```
5. Corre uma vez manualmente na consola (`python scheduler.py`) para
   confirmares que não há erros antes de deixares ao cron.

## Nota

Isto só faz a limpeza diária (kick + aviso de renovação). Toda a compra,
renovação e obtenção do link do grupo continuam a ser feitas no próprio
site — este bot não tem comandos interativos.
