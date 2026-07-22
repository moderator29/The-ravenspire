-- Report outcome metadata: who judged a report, when, and any note. Populated
-- by the admin reports POST handler so the Reports history has accountability.
alter table public.reports
  add column if not exists resolved_by uuid references public.profiles(id),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_note text;
