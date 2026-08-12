-- Quest period must hold daily dates (YYYY-MM-DD), ISO weeks (2026-W29) and
-- season ids (s1). The column was a date, which silently coerced every cadence
-- to a day and let weekly/seasonal quests be reclaimed daily. Widen to text.
alter table public.user_quests alter column period type text using period::text;
