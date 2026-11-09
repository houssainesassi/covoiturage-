-- Reverts migration 12. Vehicles saved without these details need a value before
-- the columns can be required again, so they get a neutral placeholder. Vehicles
-- with real values are not changed.

update public.vehicles set type = 'other' where type is null;
update public.vehicles set brand = '-' where brand is null;
update public.vehicles set color = '-' where color is null;

alter table public.vehicles alter column type set default 'sedan';
alter table public.vehicles alter column type set not null;
alter table public.vehicles alter column brand set not null;
alter table public.vehicles alter column color set not null;
