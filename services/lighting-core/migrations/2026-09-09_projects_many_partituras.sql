begin;

alter table if exists iluminate.partituras
  drop constraint if exists iluminate_partituras_project_uk;

alter table if exists iluminate.projects
  add column if not exists active_partitura_id bigint;

alter table if exists iluminate.projects
  drop constraint if exists iluminate_projects_active_partitura_fk;

alter table if exists iluminate.projects
  add constraint iluminate_projects_active_partitura_fk
  foreign key (active_partitura_id)
  references iluminate.partituras(id)
  on delete set null;

with ranked_partituras as (
  select id,
         project_id,
         row_number() over (
           partition by project_id
           order by (status = 'active') desc, updated_at desc, id desc
         ) as row_number
    from iluminate.partituras
   where deleted_at is null
)
update iluminate.projects project
   set active_partitura_id = ranked_partituras.id
  from ranked_partituras
 where ranked_partituras.project_id = project.id
   and ranked_partituras.row_number = 1
   and project.active_partitura_id is null;

update iluminate.partituras partitura
   set status = 'active', updated_at = now()
  from iluminate.projects project
 where project.active_partitura_id = partitura.id
   and partitura.status = 'draft';

create index if not exists iluminate_partituras_project_status_idx
  on iluminate.partituras (project_id, status, updated_at desc)
  where deleted_at is null;

comment on table iluminate.projects is
  'Client-owned LED signage or installation project. A project owns independent partituras and selects one active partitura for deployment.';

comment on column iluminate.projects.active_partitura_id is
  'Current partitura selected for this physical installation. It is not a revision pointer.';

commit;
