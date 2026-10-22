begin;

alter table iluminate.led_strip_profiles
  add column if not exists physical_leds_per_addressable_pixel numeric(12, 4);

update iluminate.led_strip_profiles
   set physical_leds_per_addressable_pixel = physical_leds_per_meter / addressable_pixels_per_meter,
       updated_at = now()
 where construction = 'discrete'
   and physical_leds_per_addressable_pixel is null
   and physical_leds_per_meter is not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'led_strip_profiles_leds_per_pixel_ck'
       and conrelid = 'iluminate.led_strip_profiles'::regclass
  ) then
    alter table iluminate.led_strip_profiles
      add constraint led_strip_profiles_leds_per_pixel_ck
      check (physical_leds_per_addressable_pixel is null or physical_leds_per_addressable_pixel > 0);
  end if;
end $$;

comment on column iluminate.led_strip_profiles.physical_leds_per_addressable_pixel is
  'Manufacturer-declared physical LEDs controlled by one addressable pixel; copied independently into the partitura snapshot.';

commit;
