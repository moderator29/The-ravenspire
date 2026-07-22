-- A vote choice must name one of the two duelists. Without this a bogus
-- choice consumed the voter's single vote and skewed the settle threshold.
alter table public.duel_votes
  add constraint duel_votes_choice_check
  check (choice in ('challenger', 'opponent')) not valid;
alter table public.duel_votes validate constraint duel_votes_choice_check;
