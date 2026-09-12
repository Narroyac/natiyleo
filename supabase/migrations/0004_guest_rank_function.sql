-- Pasaporte de Boda — Nati & Leo
-- Calcula el puesto de llegada de un invitado (entre quienes ya completaron
-- los 11 retos de actividad) y si sigue siendo elegible para el premio:
-- top 3 Y, si el cronómetro ya se inició (Fase 3-4), dentro del tiempo.

create or replace function get_guest_rank(p_code text)
returns table (completed boolean, rank int, prize_eligible boolean, prize_winners_count int)
language plpgsql security definer set search_path = public as $$
declare
  v_completed_at timestamptz;
  v_rank int;
  v_winners int;
  v_started timestamptz;
  v_duration int;
  v_extra int;
  v_deadline timestamptz;
begin
  select completed_at into v_completed_at from guests where code = upper(trim(p_code));
  if v_completed_at is null then
    return query select false, null::int, false, (select prize_winners_count from app_config);
    return;
  end if;

  select count(*) + 1 into v_rank from guests
    where completed_at is not null and completed_at < v_completed_at;

  select prize_winners_count, challenge_started_at, challenge_duration_minutes, challenge_extra_seconds
    into v_winners, v_started, v_duration, v_extra
    from app_config;

  if v_started is null then
    v_deadline := null;
  else
    v_deadline := v_started + make_interval(mins => coalesce(v_duration,0)) + make_interval(secs => coalesce(v_extra,0));
  end if;

  return query select true, v_rank,
    (v_rank <= v_winners and (v_deadline is null or v_completed_at <= v_deadline)),
    v_winners;
end $$;
grant execute on function get_guest_rank(text) to anon;
