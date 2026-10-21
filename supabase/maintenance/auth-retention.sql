-- pokedash: 30-day retention for the personal data Supabase Auth keeps in the database.
--
-- Run this once, as postgres, in the Supabase SQL editor (after `npm run db:migrate:prod`).
-- Running it again is safe: pg_cron replaces a job of the same name instead of adding a second one.
--
-- It schedules a daily pg_cron job (03:15 UTC) that
--   1. deletes Auth audit-log entries older than 30 days (they hold the IP address), and
--   2. deletes sessions with no activity for 30 days (they hold IP address and user agent).
--      Their refresh tokens and MFA claims go with them (ON DELETE CASCADE), so such a
--      session cannot be refreshed again and the person has to log in anew.
--
-- The privacy page (src/app/datenschutz/page.tsx, sections 5 and 9) states these 30 days.
-- Change both together.
--
-- Check afterwards:
--   select jobname, schedule, active from cron.job where jobname = 'pokedash-auth-retention';
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'pokedash-auth-retention')
--   order by start_time desc limit 5;

-- The same as switching on pg_cron under Database, Extensions.
create extension if not exists pg_cron;

select cron.schedule(
  'pokedash-auth-retention',
  '15 3 * * *',
  $job$
    delete from auth.audit_log_entries
    where created_at < now() - interval '30 days';

    -- Last activity is the latest of the three timestamps. refreshed_at has no time zone;
    -- Supabase Auth writes it in UTC.
    delete from auth.sessions
    where greatest(refreshed_at at time zone 'UTC', updated_at, created_at) < now() - interval '30 days';
  $job$
);
