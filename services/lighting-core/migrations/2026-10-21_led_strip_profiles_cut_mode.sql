begin;

alter table iluminate.led_strip_profiles
  add column if not exists cut_mode text;

update iluminate.led_strip_profiles
   set cut_mode = 'marked_segments'
 where cut_mode is null;

alter table iluminate.led_strip_profiles
  alter column cut_mode set default 'marked_segments',
  alter column cut_mode set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'led_strip_profiles_cut_mode_ck'
       and conrelid = 'iluminate.led_strip_profiles'::regclass
  ) then
    alter table iluminate.led_strip_profiles
      add constraint led_strip_profiles_cut_mode_ck
      check (cut_mode in ('marked_segments', 'free_cut'));
  end if;
end $$;

comment on column iluminate.led_strip_profiles.cut_mode is
  'marked_segments requires manufacturer cut boundaries; free_cut suppresses interval UI and canvas marks.';

commit;
