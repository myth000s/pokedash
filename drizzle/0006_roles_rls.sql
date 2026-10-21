DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pokedash_app') THEN
    CREATE ROLE pokedash_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pokedash_ingest') THEN
    CREATE ROLE pokedash_ingest LOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO pokedash_app, pokedash_ingest;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pokedash_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pokedash_ingest;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pokedash_ingest;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO pokedash_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pokedash_ingest;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pokedash_ingest;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    REVOKE CREATE ON SCHEMA public FROM anon, authenticated;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pokedash_app_read ON public.products FOR SELECT TO pokedash_app USING (true);
--> statement-breakpoint
CREATE POLICY pokedash_ingest_all ON public.products FOR ALL TO pokedash_ingest USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE public.benchmark_snapshots ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pokedash_app_read ON public.benchmark_snapshots FOR SELECT TO pokedash_app USING (true);
--> statement-breakpoint
CREATE POLICY pokedash_ingest_all ON public.benchmark_snapshots FOR ALL TO pokedash_ingest USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pokedash_app_read ON public.listings FOR SELECT TO pokedash_app USING (true);
--> statement-breakpoint
CREATE POLICY pokedash_ingest_all ON public.listings FOR ALL TO pokedash_ingest USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE public.listing_price_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pokedash_app_read ON public.listing_price_history FOR SELECT TO pokedash_app USING (true);
--> statement-breakpoint
CREATE POLICY pokedash_ingest_all ON public.listing_price_history FOR ALL TO pokedash_ingest USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pokedash_app_read ON public.fx_rates FOR SELECT TO pokedash_app USING (true);
--> statement-breakpoint
CREATE POLICY pokedash_ingest_all ON public.fx_rates FOR ALL TO pokedash_ingest USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE public.us_reference_prices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pokedash_app_read ON public.us_reference_prices FOR SELECT TO pokedash_app USING (true);
--> statement-breakpoint
CREATE POLICY pokedash_ingest_all ON public.us_reference_prices FOR ALL TO pokedash_ingest USING (true) WITH CHECK (true);
