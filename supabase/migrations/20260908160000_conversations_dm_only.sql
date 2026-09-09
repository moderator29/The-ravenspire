-- Whispers is DM only, by decision rather than by accident. Every row in this
-- table has only ever held kind = 'dm', and the code that reads a
-- conversation's members throughout app/api/whispers assumes exactly two: the
-- block check in app/api/whispers/messages/route.ts bails out (silently
-- treating the pair as not blocked) the moment a conversation holds anything
-- but two members, and GET /api/whispers resolves a single "other" participant
-- per conversation rather than a list. Relaxing this constraint without first
-- fixing both would ship a group conversation neither routine can reason
-- about safely. The constraint makes that decision enforced, not merely
-- documented in a comment nobody has to read before the next insert.
alter table public.conversations
  alter column kind set default 'dm',
  add constraint conversations_kind_dm_only check (kind = 'dm');
