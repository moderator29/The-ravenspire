-- A member's first-ever crest earns a real Ceremony (rule 21: ornament earned,
-- never ambient), shown once and never again. Two plain columns rather than
-- one boolean: `first_crest_slug` is set once, at grant time, and never
-- overwritten, so it survives a member earning a second crest before ever
-- opening the app to see the first one celebrated. `first_crest_celebrated`
-- is the separate fact of whether they have actually seen it, flipped once by
-- the client that showed it.
alter table public.profiles
  add column if not exists first_crest_slug text,
  add column if not exists first_crest_celebrated boolean not null default false;
