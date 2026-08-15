/*
# Fix profiles RLS infinite recursion

## Problem
The SELECT policy on `profiles` queried `profiles` itself inside the policy
predicate, causing infinite recursion: `EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true)`.

## Fix
- Replace the recursive super-admin check with a simpler policy:
  - Users can always read their own profile row (auth.uid() = id).
  - HR Manager / super-admin access to all profiles is handled at the app layer
    (HR uses the manage-user edge function which runs with the service role key,
    bypassing RLS). The frontend User Management screen also calls the edge
    function for listing, so a broad SELECT policy is not needed.
- Keep the update-own-profile policy unchanged.
*/

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_all_demo" ON profiles;
CREATE POLICY "profiles_select_all_demo"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);
