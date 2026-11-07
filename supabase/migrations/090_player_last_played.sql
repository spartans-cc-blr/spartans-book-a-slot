-- Migration: 090_player_last_played
-- Latest confirmed, already-dated booking each player was squadded for.
-- Used by /players for the "Last played" line. Aggregated in the database so
-- the result is one row per player and can never hit PostgREST's 1000-row
-- response cap (the old unpaginated squad fetch silently dropped rows).
-- Practice games count. p_today is passed by the caller (YYYY-MM-DD).

CREATE OR REPLACE FUNCTION public.player_last_played(p_today date)
RETURNS TABLE (player_id uuid, last_played date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.player_id, max(b.game_date) AS last_played
  FROM squad s
  JOIN bookings b ON b.id = s.booking_id
  WHERE b.status = 'confirmed'
    AND b.game_date <= p_today
  GROUP BY s.player_id
$$;

-- Service role only, like the tables it reads.
REVOKE ALL ON FUNCTION public.player_last_played(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_last_played(date) TO service_role;
