// Service-role REST helpers — server-only, bypasses RLS. Used for the
// `subscriptions` and `invite_links` tables, which must never be reachable
// through the public anon key.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

function headers(extra) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  }
}

export async function supabaseSelect(table, params) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) {
    throw new Error(`Supabase select ${table} failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

export async function supabaseInsert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    throw new Error(`Supabase insert ${table} failed: ${res.status} ${await res.text()}`)
  }
  const rows = await res.json()
  return rows[0]
}

export async function supabaseUpdate(table, match, patch) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [key, value] of Object.entries(match)) {
    url.searchParams.set(key, value)
  }
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    throw new Error(`Supabase update ${table} failed: ${res.status} ${await res.text()}`)
  }
}
