-- Retire two functions that were replaced, and one of which no longer works.
--
-- WHAT HAPPENED
-- Two sessions built the same two things at the same time on different
-- branches, and both sets reached the live database. The result is a pair of
-- duplicate SECURITY DEFINER functions:
--
--   open_chest_tx            superseded by chest_open
--   award_war_glory_capped   superseded by award_capped
--
-- This is the exact hazard the daily War Glory cap migration was written to
-- avoid, restated there in one line: two copies of a function that mints
-- Renown is how one of them ends up fixed and the other does not. It stopped
-- being a hazard and became a fact.
--
-- WHY THEY GO RATHER THAN STAY AS A FALLBACK
-- Nothing calls either one. Every route on this branch calls chest_open or
-- award_capped, and a grep for the old names across the codebase returns
-- nothing at all.
--
-- open_chest_tx is worse than unused: it is broken. It inserts into
-- chest_openings.nonce, and 20260813120000 dropped that column when the nonce
-- became the entitlement uuid, so any call to it now fails. A dead function
-- that would throw is not a fallback, it is a trap for whoever finds it and
-- assumes it works.
--
-- award_war_glory_capped is subtler and more dangerous. It works, it mints
-- Glory and Renown, it raises House Glory, and it caps against a limit the
-- CALLER passes in. Whoever calls it next sets the ceiling themselves, and it
-- has no relationship to DAILY_WAR_GLORY_CAP in lib/points.ts. Two capped
-- award functions with two independent ceilings is not redundancy, it is a
-- second door into the economy with its own lock.
--
-- What survives from that migration is what is still the only implementation:
-- refund_order and bump_redemption_attempt, the 'war' category, and the two
-- indexes.
--
-- Dropping a SECURITY DEFINER function is one of the few genuinely reversible
-- database changes: the definition is committed in
-- 20260813084440_commerce_hardening.sql and can be recreated verbatim.

drop function if exists public.open_chest_tx(
  uuid, text, text, text, text, integer, jsonb, jsonb
);

drop function if exists public.award_war_glory_capped(
  uuid, integer, text, uuid, integer
);
