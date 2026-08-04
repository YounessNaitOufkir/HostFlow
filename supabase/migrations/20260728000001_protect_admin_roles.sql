-- Protect Admin Roles and Provide Exclusive Owner Recovery
-- 1. Secure set_user_role to prevent demoting the owner account or the only remaining global administrator
CREATE OR REPLACE FUNCTION set_user_role(target_user_id UUID, new_role user_role)
RETURNS VOID AS $$
DECLARE
  current_role user_role;
  target_email TEXT;
  admin_count INTEGER;
BEGIN
  IF NOT is_global_admin() THEN
    RAISE EXCEPTION 'Access denied. Only administrators can change roles.';
  END IF;

  SELECT role, LOWER(email) INTO current_role, target_email FROM profiles WHERE id = target_user_id;

  -- Prevent removing admin status from platform owner
  IF target_email = 'younessnaitoufkir@gmail.com' AND new_role <> 'admin' THEN
    RAISE EXCEPTION 'Access denied. The platform owner account (younessnaitoufkir@gmail.com) cannot be demoted from Administrator.';
  END IF;

  -- Prevent removing the last admin at the database layer
  IF current_role = 'admin' AND new_role <> 'admin' THEN
    SELECT COUNT(*) INTO admin_count FROM profiles WHERE role = 'admin';
    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove admin privileges from the only remaining administrator.';
    END IF;
  END IF;

  UPDATE profiles SET role = new_role WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger on profiles to protect owner role and block unauthorized role mutations
CREATE OR REPLACE FUNCTION prevent_unauthorized_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- If target is owner, prevent demotion
    IF LOWER(OLD.email) = 'younessnaitoufkir@gmail.com' OR LOWER(NEW.email) = 'younessnaitoufkir@gmail.com' THEN
      IF NEW.role <> 'admin' THEN
        RAISE EXCEPTION 'The platform owner account (younessnaitoufkir@gmail.com) must always remain an Administrator.';
      END IF;
      RETURN NEW;
    END IF;

    -- For any non-owner user, only global admins can change role
    IF NOT is_global_admin() THEN
      RAISE EXCEPTION 'Access denied. Only global administrators can change user roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_profile_role_protection ON profiles;
CREATE TRIGGER enforce_profile_role_protection
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_unauthorized_role_change();

-- 3. Self-Recovery RPC function strictly for the platform owner
CREATE OR REPLACE FUNCTION restore_my_admin()
RETURNS VOID AS $$
DECLARE
  caller_email TEXT;
BEGIN
  SELECT LOWER(email) INTO caller_email FROM profiles WHERE id = auth.uid();
  IF caller_email <> 'younessnaitoufkir@gmail.com' THEN
    RAISE EXCEPTION 'Access denied. Only the platform owner can execute self-recovery.';
  END IF;

  UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
