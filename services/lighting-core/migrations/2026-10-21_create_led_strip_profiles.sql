begin;

create table if not exists iluminate.led_strip_profiles (
  id text primary key,
  client_id bigint references public.auth_clients(id) on delete cascade,
  profile_key text not null,
  revision integer not null default 1,
  name text not null,
  construction text not null,
  native_control_protocol text not null,
  color_model text not null,
  voltage_v numeric(8, 3) not null,
  cut_segment_length_mm numeric(12, 4) not null,
  addressable_pixels_per_cut_segment integer not null,
  physical_leds_per_cut_segment numeric(12, 4),
  physical_leds_per_addressable_pixel numeric(12, 4),
  addressable_pixels_per_meter numeric(12, 4) not null,
  physical_leds_per_meter numeric(12, 4),
  pcb_width_mm numeric(12, 4) not null,
  pcb_thickness_mm numeric(12, 4),
  led_package_size_mm numeric(12, 4),
  rated_power_w_per_meter numeric(12, 4),
  minimum_bend_radius_mm numeric(12, 4),
  backup_data_line boolean not null default false,
  source_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint led_strip_profiles_key_ck check (profile_key ~ '^[a-z0-9][a-z0-9_.:-]*$'),
  constraint led_strip_profiles_name_ck check (length(btrim(name)) > 0),
  constraint led_strip_profiles_construction_ck check (construction in ('discrete', 'continuous')),
  constraint led_strip_profiles_color_model_ck check (color_model in ('rgb', 'rgbw')),
  constraint led_strip_profiles_revision_ck check (revision > 0),
  constraint led_strip_profiles_positive_ck check (
    voltage_v > 0 and cut_segment_length_mm > 0
    and addressable_pixels_per_cut_segment > 0
    and addressable_pixels_per_meter > 0 and pcb_width_mm > 0
    and (physical_leds_per_cut_segment is null or physical_leds_per_cut_segment > 0)
    and (physical_leds_per_addressable_pixel is null or physical_leds_per_addressable_pixel > 0)
    and (physical_leds_per_meter is null or physical_leds_per_meter > 0)
    and (pcb_thickness_mm is null or pcb_thickness_mm > 0)
    and (led_package_size_mm is null or led_package_size_mm > 0)
    and (rated_power_w_per_meter is null or rated_power_w_per_meter > 0)
    and (minimum_bend_radius_mm is null or minimum_bend_radius_mm > 0)
  )
);

create unique index if not exists led_strip_profiles_global_key_revision_uk
  on iluminate.led_strip_profiles (profile_key, revision)
  where client_id is null;

create unique index if not exists led_strip_profiles_client_key_revision_uk
  on iluminate.led_strip_profiles (client_id, profile_key, revision)
  where client_id is not null;

create index if not exists led_strip_profiles_client_active_idx
  on iluminate.led_strip_profiles (client_id, active, name);

insert into iluminate.led_strip_profiles (
  id, profile_key, name, construction, native_control_protocol, color_model,
  voltage_v, cut_segment_length_mm, addressable_pixels_per_cut_segment,
  physical_leds_per_cut_segment, physical_leds_per_addressable_pixel, addressable_pixels_per_meter,
  physical_leds_per_meter, pcb_width_mm, pcb_thickness_mm,
  led_package_size_mm, rated_power_w_per_meter, backup_data_line, source_url
) values
  ('global:ws2812b-5v-30', 'ws2812b-5v-30', 'WS2812B · 5 V · 30 px/m · 1 LED/cut', 'discrete', 'ws281x', 'rgb', 5, 33.3333, 1, 1, 1, 30, 30, 10, 3, 5, 9.5, false, 'https://www.adafruit.com/product/1376'),
  ('global:ws2812b-5v-60', 'ws2812b-5v-60', 'WS2812B · 5 V · 60 px/m · 1 LED/cut', 'discrete', 'ws281x', 'rgb', 5, 16.6667, 1, 1, 1, 60, 60, 10, 3, 5, 18, false, 'https://www.waveshare.com/product/rgb-5050-5v-ip65-60d-1m.htm'),
  ('global:ws2811-12v-20', 'ws2811-12v-20', 'WS2811 · 12 V · 20 px/m · 60 LED/m · 3 LEDs/cut', 'discrete', 'ws281x', 'rgb', 12, 50, 1, 3, 3, 20, 60, 12.5, 3, 5, 10, false, 'https://www.adafruit.com/product/3869'),
  ('global:ws2815-12v-60', 'ws2815-12v-60', 'WS2815 · 12 V · 60 px/m · 1 LED/cut', 'discrete', 'ws281x', 'rgb', 12, 16.6667, 1, 1, 1, 60, 60, 10, 2.5, 5, 18, true, 'https://www.ciy-led.com/editor/file/20231020/Spec-WS2815%20LED%20Strip-Individual%20Pixel%20Control%2012VDC_Dual%20trasmission%20Signal.pdf'),
  ('global:sk6812-rgbw-5v-60', 'sk6812-rgbw-5v-60', 'SK6812 RGBW · 5 V · 60 px/m · 1 LED/cut', 'discrete', 'sk6812', 'rgbw', 5, 16.6667, 1, 1, 1, 60, 60, 10, null, 5, 11.9, false, 'https://www.enttec.com/product/led-pixel-strip/5v-rgbw-60-leds-m-pixel-strip/'),
  ('global:ws2811-cob-24v-10', 'ws2811-cob-24v-10', 'COB WS2811 · 24 V · 10 px/m · 100 mm/cut', 'continuous', 'ws281x', 'rgb', 24, 100, 1, null, null, 10, null, 10, 1.6, null, 13, false, 'https://grilite.com/wp-content/uploads/2026/02/COB-LED-light-strip-catalog.pdf')
on conflict (id) do nothing;

comment on table iluminate.led_strip_profiles is
  'Global and tenant-owned LED strip product profiles. Partituras copy a resolved snapshot and never compile against this table.';

commit;
