-- ============================================================
-- Pixel Pal — schedule the reminder push every minute
-- Run this in the Supabase SQL editor AFTER you have deployed the
-- `fire-reminders` Edge Function.
--
-- Replace the two placeholders:
--   <PROJECT_REF>        -> your project ref (the xxxx in xxxx.supabase.co)
--   <SERVICE_ROLE_KEY>   -> Project Settings > API > service_role key
--                           (server-only secret — safe here in the DB,
--                            never put it in client code)
-- ============================================================

-- enable the scheduler + outbound HTTP (idempotent)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove any previous copy so re-running this is safe
select cron.unschedule('pixelpal-fire-reminders')
where exists (select 1 from cron.job where jobname = 'pixelpal-fire-reminders');

-- run the Edge Function every minute
select cron.schedule(
  'pixelpal-fire-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/fire-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- handy checks:
--   select * from cron.job;                       -- is it scheduled?
--   select * from cron.job_run_details
--     order by start_time desc limit 10;          -- recent runs
