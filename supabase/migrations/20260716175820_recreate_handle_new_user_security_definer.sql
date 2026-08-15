/*
# Recreate handle_new_user trigger as SECURITY DEFINER

The trigger on auth.users that auto-creates a profile row needs to run with
elevated privileges to bypass RLS on the profiles table. We recreate the
function as SECURITY DEFINER so it works correctly when new users sign up
through the normal auth flow.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, role, name, jabatan)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_app_meta_data->>'role', 'Employee'),
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    'Staff'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

SELECT 'trigger_recreated' as status;
