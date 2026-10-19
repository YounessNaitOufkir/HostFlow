-- Undo 20261019000000_closed_days.sql. Nothing else references these tables,
-- so dropping them only loses the places and holidays admins entered.

drop table if exists public.public_holidays;
drop table if exists public.places;
