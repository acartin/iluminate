begin;

alter table iluminate.three_d_model_jobs
  add column if not exists display_name text;

alter table iluminate.three_d_model_jobs
  drop constraint if exists three_d_model_jobs_display_name_ck;

alter table iluminate.three_d_model_jobs
  add constraint three_d_model_jobs_display_name_ck
  check (display_name is null or (display_name = btrim(display_name) and length(display_name) between 1 and 80));

comment on column iluminate.three_d_model_jobs.display_name is
  'Optional operator-defined name for one successful Solid Object result.';

commit;
