/*
# Fix: Drop handle_new_user trigger temporarily for user seeding

The handle_new_user trigger on auth.users fires AFTER INSERT and tries to
insert into profiles. When the admin API creates a user, the trigger runs
in a context that may cause issues. We drop it temporarily so the edge
function can create users, then the edge function handles profile creation
directly with the service role key.
*/

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

SELECT 'trigger_dropped' as status;
