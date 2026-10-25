-- Add assigned_rider_id column to orders table and auto-sync with assigned_rider

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_rider_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Synchronize assigned_rider and assigned_rider_id for backward/forward compatibility
CREATE OR REPLACE FUNCTION public.sync_assigned_rider_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assigned_rider IS NOT NULL AND NEW.assigned_rider_id IS NULL THEN
    NEW.assigned_rider_id := NEW.assigned_rider;
  ELSIF NEW.assigned_rider_id IS NOT NULL AND NEW.assigned_rider IS NULL THEN
    NEW.assigned_rider := NEW.assigned_rider_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_assigned_rider ON public.orders;
CREATE TRIGGER trg_sync_assigned_rider
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_assigned_rider_columns();
