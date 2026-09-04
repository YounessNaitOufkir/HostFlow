-- Applied via the Supabase API on 2026-09-04; kept here so the schema history
-- is complete and a fresh environment builds the same shape.
--
-- Task names find a task you can already half-remember. The thing people
-- actually lose is the conversation - "that note about the invoice" - and the
-- bodies live in `updates`, as HTML, which ILIKE over a text column handles
-- badly and slowly.
--
-- A generated tsvector plus a GIN index answers it properly. The tags are
-- stripped before indexing, so a search for "table" does not match every
-- comment containing a <table>, and href values are not searchable text.
--
-- The 'simple' dictionary is deliberate. 'english' would stem English and
-- mangle French; 'french' the reverse. This workspace writes both, often in
-- the same thread, and 'simple' treats each word as itself - no stemming, no
-- stopword list - which is the honest choice when the language is not known
-- per row. It costs "run" not matching "running", and buys not having to pick
-- a language for somebody else's sentence.
--
-- Written only after the read policy on this table was fixed: indexing a
-- column that everybody could already read would have made a leak faster.

alter table public.updates
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('simple', regexp_replace(coalesce(body, ''), '<[^>]*>', ' ', 'g'))
  ) stored;

comment on column public.updates.search_tsv is
  'Full-text index of the comment with HTML tags stripped. ''simple'' rather than a language dictionary: threads here mix English and French.';

create index if not exists updates_search_tsv_idx on public.updates using gin (search_tsv);

-- The search reads recent matches first and filters deleted ones out.
create index if not exists updates_item_created_idx
  on public.updates (item_id, created_at desc)
  where deleted_at is null;
