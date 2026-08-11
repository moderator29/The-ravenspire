-- CRITICAL security fix.
--
-- These three SECURITY DEFINER functions were executable by PUBLIC, anon and
-- authenticated, and Supabase exposes every public function over PostgREST at
-- /rest/v1/rpc/<name>. Because NEXT_PUBLIC_SUPABASE_ANON_KEY ships inside the
-- browser bundle, anyone who loaded the site could call them directly and:
--
--   * increment_profile_totals  mint unlimited points and glory onto any
--                               profile id. Points convert to $RSP at TGE, so
--                               this minted future token allocation.
--   * increment_house_glory     set any House's glory, rigging the Season,
--                               the Throne and the Season reward vault.
--   * rate_limit_hit            burn any rate-limit window, denying service to
--                               other members.
--
-- The application economy is otherwise genuinely server-authoritative: award()
-- in lib/points.ts and rateLimit() in lib/rate-limit.ts are both
-- `import "server-only"` and every call site passes adminClient(), which holds
-- the service-role key. So no legitimate code path loses access here.
--
-- Detected by the Supabase security advisor (lints 0028 / 0029) against the
-- live project; all three WARN lints clear after this migration.

REVOKE ALL ON FUNCTION public.increment_profile_totals(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_house_glory(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.increment_profile_totals(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_house_glory(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer) TO service_role;
