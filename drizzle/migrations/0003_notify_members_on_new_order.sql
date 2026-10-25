CREATE OR REPLACE FUNCTION public.notify_members_new_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, partner_id, type, order_id, title, message)
  SELECT pm.user_id, NEW.partner_id, 'ORDER_NEW', NEW.id, 'New order received',
         'Order ' || NEW.order_ref || ' was pushed to your dashboard — ' || NEW.dropoff_address
  FROM public.partner_members pm
  WHERE pm.partner_id = NEW.partner_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_new_order ON public.orders;
CREATE TRIGGER trg_notify_new_order AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_members_new_order();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;