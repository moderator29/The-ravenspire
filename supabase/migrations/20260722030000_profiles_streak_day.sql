-- Streak tracking. The streak column existed but was never advanced; add the
-- day it was last counted so a daily visit can extend the streak, a missed day
-- resets it, and the same day never double-counts. UTC date.
alter table public.profiles
  add column if not exists streak_day date;
