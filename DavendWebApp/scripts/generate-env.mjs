// scripts/generate-env.mjs
import { writeFileSync, mkdirSync } from 'fs';
mkdirSync('src/environments', { recursive: true });

const supabaseURL = process.env.SUPABASE_URL ?? '';
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? ''; 

const prod = `
export const environment = {
  production: true,
  supabaseURL: '${supabaseURL}',
  supabaseKey: '${supabaseKey}'
};
`;
writeFileSync('src/environments/environment.prod.ts', prod.trim() + '\n');

// optional: dev fallback
const dev = `
export const environment = {
  production: false,
  supabaseURL: '${supabaseURL}',
  supabaseKey: '${supabaseKey}'
};
`;
writeFileSync('src/environments/environment.ts', dev.trim() + '\n');
console.log('✓ environments generated');
