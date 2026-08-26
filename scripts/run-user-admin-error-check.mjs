import assert from 'node:assert/strict';
import { extractUserAdminError } from '../lib/userAdminErrors.ts';

const functionsError = context => ({ name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context });

assert.equal(
  await extractUserAdminError(functionsError(new Response(JSON.stringify({ error: 'You do not have permission to manage users.' }), { status: 403 }))),
  'You do not have permission to manage users.',
);

assert.equal(
  await extractUserAdminError(functionsError(new Response('Email rate limit exceeded.', { status: 429 }))),
  'Email rate limit exceeded.',
);

assert.equal(
  await extractUserAdminError(functionsError({ json: async () => ({ message: 'The invitation could not be completed.' }) })),
  'The invitation could not be completed.',
);

const consumedResponse = new Response(JSON.stringify({ error: 'This body has already been consumed.' }));
await consumedResponse.text();
assert.equal(await extractUserAdminError(functionsError(consumedResponse)), null);
assert.equal(await extractUserAdminError(new Error('No response context')), null);

console.log('User-admin error handling checks passed.');
