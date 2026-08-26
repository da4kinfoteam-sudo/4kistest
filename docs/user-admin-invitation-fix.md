# User Management invitation authentication fix

## Scope

This change applies only to the hosted `4kistest` environment:

- Supabase project: `zojmlmolznkqhxgwthsq`
- Vercel project: `4kistest`
- URL: `https://4kistest.vercel.app`

Production services and `4kis.vercel.app` are not part of this change.

## Root cause

The `user-admin` Edge Function created a Supabase client with `persistSession: false` and called `auth.getUser()` without passing the request's bearer token. Since the server-side client had no stored session, every valid User Management request returned `Auth session missing!` and the function translated that into HTTP 401.

The function now extracts the bearer token and validates it explicitly with the service-role client. The verified Auth user's `auth_id` remains the only source for resolving the application profile and centralized permissions.

## Frontend error handling

The User Management invocation now reads only safe `error` or `message` fields from a Supabase Function response. It supports JSON, plain text, empty, malformed, and already-consumed responses and uses a safe fallback when no response body is available. Tokens, headers, stack traces, and service credentials are never rendered.

## Verification

Local verification does not use a local Supabase instance. The following checks passed:

- TypeScript check (`npm run lint`)
- Production build (`npm run build`)
- User-admin response parsing checks (`npm run test:user-admin-errors`)
- Existing LOD, GAD/PIMME, financial, Drive, identity, access-control, UI consistency, and legacy-style checks

The corrected `user-admin` function was deployed to hosted 4kistest as version 6 with JWT verification still enabled. Its deployed source hash is `6fc18c55742e5abd6b6962a8c17a2d301699a8e7df88626d8f481298de870883`. A hosted Super Admin request using a valid session JWT reached the handler and returned the expected safe response for an unsupported diagnostic action instead of HTTP 401.

The hosted invitation smoke test also confirmed that Supabase's email rate limit is surfaced as `email rate limit exceeded` and does not create an Auth or application-user record. A successful invitation should be repeated with an approved controlled mailbox after the hosted email-rate window resets.

## Cross-system consistency

Supabase Auth and `public.users` are separate systems, so invitation creation and profile synchronization cannot be one database transaction. The function reports downstream failures instead of returning success. Any future compensation or retry changes must remain limited to the isolated 4kistest project and must avoid duplicate Auth/profile records.
