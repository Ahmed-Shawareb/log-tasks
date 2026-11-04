-- Same defence-in-depth as row_level_security: the Data API roles never see business data.
ALTER TABLE public."TaskType" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON public."TaskType" FROM anon'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON public."TaskType" FROM authenticated'; END IF;
END $$;
ALTER TABLE "Task" ADD CONSTRAINT "Task_quantity_positive" CHECK ("quantity" IS NULL OR "quantity" > 0);
