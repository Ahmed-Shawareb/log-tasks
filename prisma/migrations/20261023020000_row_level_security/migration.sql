-- Defence in depth for Supabase: the app talks to Postgres only from the server (Prisma, table owner),
-- so Supabase's public Data API roles (anon / authenticated) must never be able to read business data.
-- RLS is enabled on every table with NO policies → PostgREST clients get zero rows / are denied.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
END $$;

-- Data-integrity guards the ORM cannot express.
ALTER TABLE "Task" ADD CONSTRAINT "Task_schedule_order" CHECK ("scheduledStart" IS NULL OR "scheduledEnd" IS NULL OR "scheduledEnd" > "scheduledStart");
ALTER TABLE "Task" ADD CONSTRAINT "Task_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_not_self" CHECK ("taskId" <> "dependsOnId");
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_range_order" CHECK ("endsAt" > "startsAt");
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_minutes_positive" CHECK ("minutes" >= 0);
