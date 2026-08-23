begin;

alter table if exists iluminate.controllers
  drop constraint if exists iluminate_controllers_active_revision_fk,
  drop constraint if exists iluminate_controllers_desired_revision_fk;

alter table if exists iluminate.deployments
  drop constraint if exists iluminate_deployments_partitura_revision_id_fkey;

alter table if exists iluminate.device_status_reports
  drop constraint if exists device_status_reports_reported_partitura_revision_id_fkey;

alter table if exists iluminate.controllers
  add column if not exists active_partitura_id bigint,
  add column if not exists desired_partitura_id bigint,
  drop column if exists active_partitura_revision_id,
  drop column if exists desired_partitura_revision_id;

alter table if exists iluminate.deployments
  add column if not exists partitura_id bigint,
  drop column if exists partitura_revision_id;

alter table if exists iluminate.device_status_reports
  add column if not exists reported_partitura_id bigint,
  add column if not exists reported_command_sequence integer,
  drop column if exists reported_partitura_revision_id,
  drop column if exists reported_command_revision;

alter table if exists iluminate.device_commands
  add column if not exists command_sequence integer;

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'iluminate'
       and table_name = 'device_commands'
       and column_name = 'command_revision'
  ) then
    update iluminate.device_commands
       set command_sequence = command_revision
     where command_sequence is null
       and command_revision is not null;
  end if;
end $$;

alter table if exists iluminate.device_commands
  drop constraint if exists iluminate_device_commands_revision_ck,
  drop constraint if exists iluminate_device_commands_controller_revision_uk;

alter table if exists iluminate.device_commands
  drop column if exists command_revision;

update iluminate.device_commands
   set command_sequence = 1
 where command_sequence is null;

alter table if exists iluminate.device_commands
  alter column command_sequence set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'iluminate_device_commands_sequence_ck'
       and conrelid = 'iluminate.device_commands'::regclass
  ) then
    alter table iluminate.device_commands
      add constraint iluminate_device_commands_sequence_ck check (command_sequence > 0);
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'iluminate_device_commands_controller_sequence_uk'
       and conrelid = 'iluminate.device_commands'::regclass
  ) then
    alter table iluminate.device_commands
      add constraint iluminate_device_commands_controller_sequence_uk unique (controller_id, command_sequence);
  end if;
end $$;

drop index if exists iluminate.iluminate_partitura_revisions_client_project_idx;
drop index if exists iluminate.iluminate_partitura_revisions_json_gin_idx;
drop index if exists iluminate.iluminate_device_commands_controller_status_idx;

drop table if exists iluminate.partitura_revisions cascade;

create index if not exists iluminate_device_commands_controller_status_idx
  on iluminate.device_commands (client_id, controller_id, status, command_sequence desc);

comment on schema iluminate is
  'Iluminate operational schema: projects, controllers, partituras, deployments, device state, assets and audit.';

comment on table iluminate.projects is
  'Client-owned LED signage or installation project. A project owns one current persisted partitura.';

comment on table iluminate.controllers is
  'ESP32 controller registry. Controllers receive desired partituras and report status.';

comment on table iluminate.deployments is
  'Publication history linking a current partitura to a target controller.';

comment on table iluminate.device_commands is
  'Commands queued for controllers, such as scene changes, refresh, rollback, restart or identify.';

comment on table iluminate.device_status_reports is
  'Status reports received from controllers, including applied partitura, active scene and health payload.';

commit;
