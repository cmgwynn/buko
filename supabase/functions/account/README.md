# Account export and deletion

Deploy migration `0007_account.sql` after migrations 0001–0006, then deploy the
`account` Edge Function. Do not expose its service-role key in client config.
Standard server environment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. Optional `REVENUECAT_SECRET_API_KEY` enables deletion
of the authenticated Supabase UUID subscriber through RevenueCat's server API.
It does **not** cancel subscriptions or remove app-store purchase records.

Register `/account` for any signed-in user, including incomplete onboarding.
Register `/delete-account` as a public route, not behind onboarding or a paywall.
Publish the actual HTTPS `/delete-account` URL in Google Play's deletion-link
field. The page explains sign-in, export, confirmation and retained copies; do
not replace it with a login-only URL. Owner contact/privacy/retention documents
must reflect the real deployed providers and policies, not invented durations.
Native downloads require compatible `expo-file-system` and `expo-sharing`
packages and a rebuilt app.

## API

`POST /functions/v1/account`, bearer access token, JSON body:

- `{"action":"export"}` returns a JSON account export.
- `{"action":"delete","confirmation":"DELETE"}` permanently deletes the account.

The function verifies the token with GoTrue, derives the user only from that
verified response, and checks the verified JWT's actual authentication-method
timestamp plus GoTrue's last sign-in time. Authentication must be within ten
minutes; access-token refresh does not reauthenticate. Password confirmation in
the client signs in again. Missing AMR claims fail closed; use a normal fresh
password/provider sign-in. No service secret, password hash or session token is
included in the export or logged.

The database export inventory discovers every public nonpartition-child table
with a UUID `user_id`, including server-only coach/billing/diagnostic usage and
future subscriptions. Child recipe/workout rows have their own user ownership
and are included. Shared exercise seeds, billing configuration and global coach
budgets are not personal records. Future user data must retain a UUID `user_id`
and `auth.users(id) ON DELETE CASCADE`; new tables/identifiers without that
ownership contract or new storage buckets require explicit account integration.

Pagination has digest/count checks and a final verification pass. This detects
changes, but is not a single cross-table transaction snapshot; avoid editing
during export. Limits are **25,000 total database rows plus photo objects**,
**1,000 photos**, **5 MiB raw bytes per photo**, **20 MiB complete compact JSON**
(including base64 expansion and the device's added draft/preferences). Both
platform download writers recheck the final compact JSON byte count before
saving. Exceeding a limit returns an
explicit error with no partial dataset; the operator must arrange a complete
assisted export for larger accounts. SQL also refuses to materialize a table
over 25,000 rows. Export format version 2 embeds every saved private photo's
actual bytes as `assets[].base64`, with `encoding: "base64"`, `contentType`,
`byteLength` and bucket-relative `path`. Decode base64 using that content type
to recover the original file. These durable assets do not expire or depend on
an existing account. No signed URLs, storage credentials or service secrets
are shipped. Downloads use authenticated server-side Storage requests, are
streamed with byte limits, and run sequentially to bound memory. Any download,
content-type, empty-image or size failure rejects the whole export explicitly;
there is no link-only fallback or silently omitted image. All owned
`recipe-photos/<user-id>/...` objects are inventoried, including unreferenced and
nested paths, not just current recipe photo references.

The client adds this device's in-memory recipe draft, workout and scoped
diagnostics preference. Unsaved local image URIs are references on this device,
not uploaded photo assets. Web uses a JSON download. Native uses an owner-scoped
cache file and a share sheet; cancelling sharing is not claimed as saving. The
cache file is removed when sharing closes, and any surviving owned cache
directory is removed on account deletion. Copies explicitly saved/shared by
the user remain under their control.

## Deletion and failures

Deletion drains storage through the Storage API **before** external subscriber
and auth deletion. Storage pagination always drains page zero to avoid skipping
objects after deletions. Failure returns `DELETION_INCOMPLETE`, its stage,
confirmed photo-removal count and retry instructions; neither incomplete
storage nor a configured RevenueCat failure proceeds to auth deletion.
Network failure may make the final outcome uncertain; retry only if sign-in
still works. No global AsyncStorage clear or another user's cache deletion is
performed. Local auth, recipe/workout memory and owned preferences/export caches
are cleared after confirmed deletion; local failures are reported distinctly.

Auth deletion is an explicit hard delete; cascades remove owned database rows.
A database trigger refuses auth deletion while recipe photos remain and deletes
owned routine/workout exercise children transactionally to avoid their exercise
`RESTRICT` FKs blocking the auth cascade. A photo-write trigger locks the owning
auth row, serializing uploads against auth deletion and rejecting orphan writes.
Deploying storage/auth triggers requires the normal migration owner privileges;
apply the migration as the project database owner, not an app role.

This removes active Buko records, not all copies everywhere. Apple Health /
Health Connect originals and previously written samples remain in those apps.
Downloaded exports, shared copies, backups, infrastructure/security logs, store
transactions and external provider records may remain under their applicable
retention policies. No immediate backup purge, refund or subscription
cancellation is promised. RevenueCat subscriber deletion is skipped explicitly
if its secret is not configured; validate the project's subscriber identity
mapping (Supabase UUID) before enabling purchases.

Validation: `npx tsx --test src/lib/account/*.test.ts`. SQL tests run the real
local migrations in PGlite; they do not connect to or mutate a remote database.
