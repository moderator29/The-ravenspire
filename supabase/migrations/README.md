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

The four incidents above were all the same divergence: production carrying schema
no file described. The opposite divergence is also possible and is much less
dangerous, but it still has to be written down, because a reader who assumes
every file here has run will go looking for a table that is not there.

- **`20260813183000_gasless_and_forgiving.sql`** (mission 11). Two tables
  (`wallet_sponsorship_grants`, `member_wallet_guardrails`), one `realm_flags`
  row (`gasless_live`, seeded false), four `SECURITY DEFINER` functions. It
  **alters nothing that already exists**, so the read-the-live-definition rule
  above had nothing to check against. In particular it does not touch
  `member_commerce_limits`: the signing ceiling it adds is a different feature
  from the commerce spend cap, and `docs/RAVENSPIRE-V2.md` section 50.4 sets out
  why at length.

  Until it is applied, `/api/wallet/guardrails` answers `503 not migrated` on the
  `42883` and `42P01` codes and every Vault panel that depends on it renders
  nothing, which is the designed behaviour rather than a fault to fix.

## Applied in parts, and why the filenames say so

Two of the recent migrations were applied through the Supabase API in more than
one call, so production recorded more than one version for what was written as
one file. The files here carry the names and versions production recorded, the
same way the Bazaar's four do, so the two listings read the same:

- The Bazaar, `20260813112210` through `20260813112411`.
- The compliance guardrails, `20260813164228` through `20260813164429`: the
  tables, the checkout guard, the state a member controls, and the Alms with
  the grants.

`20260813113137_appointments_and_seasons.sql` was written under a later
filename and applied under this one. It is renamed to what ran.

The compliance guardrails alter one existing object,
`chest_entitlements_source_kind_check`. Its live definition was read out of the
project before the migration was written, per the rule above, and was
`('order', 'redemption')`, matching `20260812224950_commerce_engine.sql`. The
change adds `'amoe'` and removes nothing. Checked, not assumed.

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
