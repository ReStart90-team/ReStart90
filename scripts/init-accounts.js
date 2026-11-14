import { createDurableStore } from '../lib/durable.js';
import { createPhoneAuth } from '../lib/phone-auth.js';

// Finite additive preparation only: no seeds, synthetic users or DELETEs.
// DATABASE_URL and the stable project secret stay server-side and are not logged.
const config = { url: process.env.DATABASE_URL, secret: process.env.RESTART90_DATA_SECRET || process.env.MANUS_JWT_SECRET };
const durable = createDurableStore(config);
const auth = createPhoneAuth(config);
try {
  await durable.init();
  await auth.init();
  if (!durable.persistent || !auth.available) throw new Error('Accounts are not ready');
  console.log('ReStart90 account and private-case schemas ready (additive initialization; no account seeds).');
} catch {
  console.error('ReStart90 account initialization failed; private access must remain unavailable.');
  process.exitCode = 1;
} finally {
  await Promise.allSettled([durable.close(), auth.close()]);
}
