-- The browser can receive a version notification but all room state stays server-only.
create table public.ponomoly_rooms (
  code text primary key check (code ~ '^[A-Z2-9]{7}$'),
  topic text unique not null,
  created_by text unique not null,
  revision integer not null check (revision >= 1),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ponomoly_presence (
  code text references public.ponomoly_rooms(code) on delete cascade,
  player uuid not null,
  seen timestamptz not null default now(),
  primary key (code, player)
);

alter table public.ponomoly_rooms enable row level security;
alter table public.ponomoly_presence enable row level security;
revoke all on public.ponomoly_rooms, public.ponomoly_presence from anon, authenticated;
grant select, insert, update on public.ponomoly_rooms, public.ponomoly_presence to service_role;

create function public.ponomoly_broadcast_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.revision is distinct from old.revision then
    -- Topic has 192 bits of randomness, and the message only carries a revision.
    -- If Realtime is unavailable the client falls back to authenticated reads.
    begin
      perform realtime.send(jsonb_build_object('revision', new.revision), 'revision', new.topic, false);
    exception when others then
      raise warning 'Ponomoly Realtime notification failed (SQLSTATE %)', sqlstate;
    end;
  end if;
  return new;
end;
$$;

revoke execute on function public.ponomoly_broadcast_revision() from public;

create trigger ponomoly_room_revision
before update on public.ponomoly_rooms
for each row execute function public.ponomoly_broadcast_revision();
