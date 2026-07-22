-- Auth+security hardening (AUDIT "Auth + security" #6/#16/#3):
-- Shared, cross-instance rate-limit store to replace the per-instance in-memory
-- Map in /api/raven (which resets on cold start and multiplies across lambdas).
-- Fixed-window counter, incremented atomically in a single upsert so concurrent
-- requests cannot race past the limit. Only the service role touches it.
create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- No policies: anon/authenticated get nothing; the service role bypasses RLS.
revoke all on public.rate_limits from anon, authenticated;

-- Atomic hit: increments the window counter (resetting when the window has
-- elapsed) and returns the post-increment count. Caller compares to its limit.
create or replace function public.rate_limit_hit(
  p_key text,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits (key, count, window_start)
    values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when public.rate_limits.window_start
               < now() - make_interval(secs => p_window_seconds)
          then 1
          else public.rate_limits.count + 1
        end,
        window_start = case
          when public.rate_limits.window_start
               < now() - make_interval(secs => p_window_seconds)
          then now()
          else public.rate_limits.window_start
        end
  returning count into v_count;
  return v_count;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer) from public;
grant execute on function public.rate_limit_hit(text, integer) to service_role;
