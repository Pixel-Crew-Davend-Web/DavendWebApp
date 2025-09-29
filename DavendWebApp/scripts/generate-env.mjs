// scripts/generate-env.mjs
import { writeFileSync, mkdirSync } from 'fs';
mkdirSync('src/environments', { recursive: true });

// read from process.env (use defaults if missing)
const supabaseURL = process.env.SUPABASE_URL ?? '';
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? '';

const nodeEnv = process.env.NODE_ENV ?? '';
const port = process.env.PORT ?? '';
const frontendUrl = process.env.FRONTEND_URL ?? '';
const apiBaseUrl = process.env.API_BASE_URL ?? ''; 

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? '';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';

const emailUser = process.env.EMAIL_USER ?? '';
const emailPass = process.env.EMAIL_PASS ?? '';

const paypalClientId = process.env.PAYPAL_CLIENT_ID ?? '';
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET ?? '';
const paypalEnv = process.env.PAYPAL_ENV ?? '';

// PROD config
const prod = `
export const environment = {
  production: true,
  supabaseURL: '${supabaseURL}',
  supabaseKey: '${supabaseKey}',

  // General
  nodeEnv: '${nodeEnv}',
  port: '${port}',
  frontendUrl: '${frontendUrl}',
  apiBaseUrl: '${apiBaseUrl}',

  // Stripe
  stripeSecretKey: '${stripeSecretKey}',
  stripePublishableKey: '${stripePublishableKey}',
  stripeWebhookSecret: '${stripeWebhookSecret}',

  // Email
  emailUser: '${emailUser}',
  emailPass: '${emailPass}',

  // PayPal
  paypalClientId: '${paypalClientId}',
  paypalClientSecret: '${paypalClientSecret}',
  paypalEnv: '${paypalEnv}'
};
`;
writeFileSync('src/environments/environment.prod.ts', prod.trim() + '\n');

// DEV config
const dev = `
export const environment = {
  production: false,
  supabaseURL: '${supabaseURL}',
  supabaseKey: '${supabaseKey}',

  // General
  nodeEnv: '${nodeEnv}',
  port: '${port}',
  frontendUrl: '${frontendUrl}',
  apiBaseUrl: '${apiBaseUrl}',

  // Stripe
  stripeSecretKey: '${stripeSecretKey}',
  stripePublishableKey: '${stripePublishableKey}',
  stripeWebhookSecret: '${stripeWebhookSecret}',

  // Email
  emailUser: '${emailUser}',
  emailPass: '${emailPass}',

  // PayPal
  paypalClientId: '${paypalClientId}',
  paypalClientSecret: '${paypalClientSecret}',
  paypalEnv: '${paypalEnv}'
};
`;
writeFileSync('src/environments/environment.ts', dev.trim() + '\n');

console.log('✓ environments generated');
