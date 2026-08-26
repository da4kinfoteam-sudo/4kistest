import assert from 'node:assert/strict';
import { extractBearerToken } from '../supabase/functions/_shared/userAdminAuth.ts';

assert.equal(extractBearerToken(null), null);
assert.equal(extractBearerToken(''), null);
assert.equal(extractBearerToken('Basic abc'), null);
assert.equal(extractBearerToken('Bearer'), null);
assert.equal(extractBearerToken('Bearer    '), null);
assert.equal(extractBearerToken('Bearer token-value'), 'token-value');
assert.equal(extractBearerToken('bearer token.value'), 'token.value');
assert.equal(extractBearerToken('Bearer token value'), null);

console.log('User-admin bearer-token checks passed.');
