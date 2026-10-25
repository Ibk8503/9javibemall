-- Clear out any existing dummy/mock orders and delivery events
-- This ensures ONLY real orders created via POST /api/public/orders appear on dashboards
TRUNCATE TABLE public.delivery_events CASCADE;
TRUNCATE TABLE public.orders CASCADE;
