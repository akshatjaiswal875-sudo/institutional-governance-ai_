-- Atomically replace one faculty member's timetable by their institutional email.
create or replace function public.replace_faculty_timetable(
  p_faculty_email text, p_uploader_id uuid, p_rows jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_target_email text := lower(trim(coalesce(p_faculty_email, '')));
  v_target public.users%rowtype;
  v_actor public.users%rowtype;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if v_target_email = '' or p_uploader_id is null
     or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'A target faculty email and non-empty timetable are required' using errcode = '22023';
  end if;
  select * into v_target from public.users
    where lower(trim(email)) = v_target_email limit 1;
  if v_target.id is null then
    raise exception 'Target institutional user not found' using errcode = '22023';
  end if;
  select * into v_actor from public.users where id = p_uploader_id;
  if v_actor.id is null then
    raise exception 'Uploader profile not found' using errcode = '42501';
  end if;
  if lower(trim(coalesce(v_actor.email, ''))) <> v_target_email then
    if v_actor.role::text not in ('Director', 'Super Admin')
       and not (v_actor.role::text = 'HOD'
         and nullif(trim(v_actor.department), '') is not null
         and lower(trim(v_actor.department)) = lower(trim(coalesce(v_target.department, '')))) then
      raise exception 'Uploader is not authorized for this faculty member' using errcode = '42501';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_target_email, 0));
  delete from public.institutional_timetable_entries
    where lower(trim(coalesce(faculty_email, ''))) = v_target_email;

  insert into public.institutional_timetable_entries (
    title, event_type, starts_at, ends_at, department, faculty_email,
    room, source_filename, created_by, is_recurring_weekly, weekday, start_time, end_time
  )
  select x.title, coalesce(nullif(x.event_type, ''), 'lecture'),
    x.starts_at, x.ends_at, coalesce(x.department, v_target.department),
    v_target_email, x.room, x.source_filename, p_uploader_id,
    coalesce(x.is_recurring_weekly, false), x.weekday, x.start_time, x.end_time
  from jsonb_to_recordset(p_rows) as x(
    title text, event_type text, starts_at timestamptz, ends_at timestamptz,
    department text, faculty_email text, room text, source_filename text,
    created_by uuid, is_recurring_weekly boolean, weekday smallint,
    start_time time, end_time time
  );
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'No timetable entries were inserted' using errcode = '22023';
  end if;
  return jsonb_build_object('imported', v_count, 'faculty_email', v_target_email);
end;
$$;
revoke all on function public.replace_faculty_timetable(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_faculty_timetable(text, uuid, jsonb) to service_role;
