import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const envText = await fs.readFile('.env.local', 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map(line => line.match(/^([^#=]+)=(.*)$/))
    .filter(Boolean)
    .map(match => [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')]),
);
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const tables = [
  ['users', 'id,username,fullName,email,role,operatingUnit,visibility_scope,requires_approver,approver_id,permissions_override'],
  ['roles_config', '*'],
  ['user_roles_config', '*'],
  ['dcf_policy_settings', '*'],
];
const snapshot = { exported_at: new Date().toISOString(), tables: {} };

for (const [table, columns] of tables) {
  const { data, error } = await client.from(table).select(columns);
  if (error) throw new Error(`${table}: ${error.message}`);
  snapshot.tables[table] = data;
}

await fs.mkdir('.codex-backups', { recursive: true });
const output = `.codex-backups/4kistest-access-config-${snapshot.exported_at.slice(0, 10)}.json`;
await fs.writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });
console.log(`Exported sanitized access configuration to ${output}`);
