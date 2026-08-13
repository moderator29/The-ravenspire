# Migrations, and the four times this directory lied

Read this before writing a migration that touches anything that already exists.

## The rule

**Before you alter a constraint, an enum, a check, or any existing object, read
its CURRENT definition out of the live database and diff it against this
directory. Do not trust these files alone.**

```sql
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.<table>'::regclass and contype = 'c';
```

And list what has actually run:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

## Why the rule exists

This repository and the live project (`tqvigouaifbklvajiyoj`) have diverged four
times, every one of them the same way: a branch reached `main` with its code and
without its migration file, so production carried schema that no file described.

1. **`commerce_engine`.** Five tables, including `inventory`, existed only in
   production. Recovered as `20260812224950_commerce_engine.sql`.
2. **A filename that did not match its version.** The same migration was
   authored as `20260812130000` and applied as `20260812224950`, so the CLI
   would have seen an unapplied migration and run it again.
3. **`commerce_hardening`.** A changed constraint, an index and four
   `SECURITY DEFINER` functions existed only in production. Recovered as
   `20260813084440_commerce_hardening.sql`. Two of its functions were duplicates
   of work another branch built at the same time, and are dropped by
   `20260815090000_retire_the_superseded_rpcs.sql`.
4. **The one that nearly broke the War.** `points_ledger_category_check` allows
   `'war'` in production because incident 3 added it. This directory said
   `('social', 'call')`. A later migration re-added the constraint from that
   stale reading, which would have dropped `'war'`, and `public.award_capped`
   writes exactly that category on every settled battle. Every War award in the
   realm would have started failing its check constraint. It was caught in
   review by diffing against production, not by any test, because **no test can
   see a constraint that exists in only one place.**

## Filenames and versions do not match, and cannot

Migrations applied through the Supabase API are stamped with a server-side
version at apply time, not with the timestamp in the filename. So a file named
`20260813090000_ownership_loop.sql` is recorded as version `20260812231102`.
That mismatch is inherent and is not itself a bug.

What matters is the pair of properties this directory has to keep:

- **Every applied version has a file here**, so the schema can be reviewed and
  rebuilt. This is the property that broke four times.
- **The file's content is what ran.** Where a file was recovered from
  production, its header says so and the text is verbatim.

The Bazaar is split into four files (`20260813112210` through `20260813112411`)
because it was applied in four parts, and the files carry the names and versions
production recorded so the two listings read the same.

## Written and not yet applied

Two files here describe schema the live project does not have. Both are
deliberate: they were written for a human to audit before applying, which is
the opposite of the failure this document records and does not create it. The
invariant that broke four times is "every APPLIED version has a file", and it
still holds.

- `20260817090000_appointments_and_seasons.sql`
- `20260819090000_compliance_guardrails.sql`

The second alters one existing object, `chest_entitlements_source_kind_check`.
Its live definition was read out of the project first, per the rule above, and
is `('order', 'redemption')`, matching `20260812224950_commerce_engine.sql`.
The change adds `'amoe'` and removes nothing. It was replayed against a
throwaway Postgres 16 cluster twice, to prove both that it runs and that it is
idempotent, rather than against production.

## The rest of the posture

Every table is RLS deny-by-default with ownership enforced in the route under
the service role, because this stack authenticates with Privy and `auth.uid()`
is always null. Every `SECURITY DEFINER` function is revoked from `public`,
`anon` and `authenticated` and granted to `service_role` alone: Supabase
publishes every public function at `/rest/v1/rpc/<name>` and the anon key ships
in the browser bundle. See
`20260811090000_revoke_public_execute_on_economy_rpcs.sql` for the incident that
rule comes from.

Run the Supabase security advisor after any DDL. Expect only INFO
`rls_enabled_no_policy` lints; anything else is new and is yours.
