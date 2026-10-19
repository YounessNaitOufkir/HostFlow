-- Closed days: places that shut on given weekdays, and Morocco's public holidays.
--
-- A task tagged "banque" planned for a Saturday is a wasted trip. A place says
-- which tags it answers to and which days it is shut; the app warns when a
-- task's whole timeline falls on days its place is closed. It is a warning,
-- never a block: a branch open on Saturday morning is something the person
-- knows and the app does not.
--
-- Everyone reads both tables (the date picker greys closed days for anybody
-- planning a task); only admins change them.

CREATE TABLE IF NOT EXISTS public.places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  -- The tags that mean "this happens at this place". Matched in the app
  -- ignoring case, accents and a leading #.
  tags text[] NOT NULL DEFAULT '{}',
  -- 0 = Sunday ... 6 = Saturday, as JavaScript's Date.getDay().
  closed_weekdays smallint[] NOT NULL DEFAULT '{}'
    CHECK (closed_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  closed_on_holidays boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS places_name_key ON public.places (lower(btrim(name)));

-- A holiday with no year comes back every year on the same day (Throne Day).
-- One with a year is a single date: the religious holidays follow the moon, so
-- each year's are entered on their own, marked estimated until the ministry
-- announces the sighting. A two-day holiday is two rows.
CREATE TABLE IF NOT EXISTS public.public_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  day smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
  year smallint CHECK (year BETWEEN 2000 AND 2100),
  estimated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_holidays_year_idx ON public.public_holidays (year);

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Places: Select" ON public.places;
CREATE POLICY "Places: Select" ON public.places
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Places: Insert" ON public.places;
CREATE POLICY "Places: Insert" ON public.places
  FOR INSERT TO authenticated WITH CHECK (public.is_global_admin());
DROP POLICY IF EXISTS "Places: Update" ON public.places;
CREATE POLICY "Places: Update" ON public.places
  FOR UPDATE TO authenticated USING (public.is_global_admin()) WITH CHECK (public.is_global_admin());
DROP POLICY IF EXISTS "Places: Delete" ON public.places;
CREATE POLICY "Places: Delete" ON public.places
  FOR DELETE TO authenticated USING (public.is_global_admin());

DROP POLICY IF EXISTS "Holidays: Select" ON public.public_holidays;
CREATE POLICY "Holidays: Select" ON public.public_holidays
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Holidays: Insert" ON public.public_holidays;
CREATE POLICY "Holidays: Insert" ON public.public_holidays
  FOR INSERT TO authenticated WITH CHECK (public.is_global_admin());
DROP POLICY IF EXISTS "Holidays: Update" ON public.public_holidays;
CREATE POLICY "Holidays: Update" ON public.public_holidays
  FOR UPDATE TO authenticated USING (public.is_global_admin()) WITH CHECK (public.is_global_admin());
DROP POLICY IF EXISTS "Holidays: Delete" ON public.public_holidays;
CREATE POLICY "Holidays: Delete" ON public.public_holidays
  FOR DELETE TO authenticated USING (public.is_global_admin());

REVOKE ALL ON public.places, public.public_holidays FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.places, public.public_holidays TO authenticated;

-- ---------------------------------------------------------------------------
-- Starting points. Admins edit or remove them; nothing here is load-bearing.
-- ---------------------------------------------------------------------------

INSERT INTO public.places (name, tags, closed_weekdays, closed_on_holidays)
SELECT v.name, v.tags, v.closed_weekdays, v.closed_on_holidays
  FROM (VALUES
    ('Banque',         ARRAY['banque', 'bank'],                     ARRAY[0, 6]::smallint[], true),
    ('Administration', ARRAY['administration', 'admin'],            ARRAY[0, 6]::smallint[], true),
    ('Souk Salihine',  ARRAY['souk salihine', 'salihine', 'souk'],  ARRAY[5]::smallint[],    false)
  ) AS v(name, tags, closed_weekdays, closed_on_holidays)
 WHERE NOT EXISTS (SELECT 1 FROM public.places);

INSERT INTO public.public_holidays (name, month, day, year, estimated)
SELECT v.name, v.month, v.day, v.year, v.estimated
  FROM (VALUES
    -- Every year.
    ('Nouvel An',                          1,  1, NULL::smallint, false),
    ('Manifeste de l''Indépendance',       1, 11, NULL, false),
    ('Nouvel An amazigh',                  1, 14, NULL, false),
    ('Fête du Travail',                    5,  1, NULL, false),
    ('Fête du Trône',                      7, 30, NULL, false),
    ('Oued Ed-Dahab',                      8, 14, NULL, false),
    ('Révolution du Roi et du Peuple',     8, 20, NULL, false),
    ('Fête de la Jeunesse',                8, 21, NULL, false),
    ('Fête de l''Unité',                  10, 31, NULL, false),
    ('Marche Verte',                      11,  6, NULL, false),
    ('Fête de l''Indépendance',           11, 18, NULL, false),
    -- 2027, following the moon: confirm each once it is announced.
    ('Aïd Al Fitr',                        3, 10, 2027, true),
    ('Aïd Al Fitr (2e jour)',              3, 11, 2027, true),
    ('Aïd Al Adha',                        5, 17, 2027, true),
    ('Aïd Al Adha (2e jour)',              5, 18, 2027, true),
    ('1er Moharram',                       6,  7, 2027, true),
    ('Aïd Al Mawlid',                      8, 16, 2027, true),
    ('Aïd Al Mawlid (2e jour)',            8, 17, 2027, true)
  ) AS v(name, month, day, year, estimated)
 WHERE NOT EXISTS (SELECT 1 FROM public.public_holidays);
