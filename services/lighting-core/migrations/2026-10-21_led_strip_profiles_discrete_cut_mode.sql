begin;

update iluminate.led_strip_profiles
   set cut_mode = 'marked_segments'
 where construction = 'discrete'
   and cut_mode <> 'marked_segments';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'led_strip_profiles_discrete_cut_mode_ck'
       and conrelid = 'iluminate.led_strip_profiles'::regclass
  ) then
    alter table iluminate.led_strip_profiles
      add constraint led_strip_profiles_discrete_cut_mode_ck
      check (construction = 'continuous' or cut_mode = 'marked_segments');
  end if;
end $$;

commit;
