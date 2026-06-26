-- Add role and permission columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS role text DEFAULT 'member',
ADD COLUMN IF NOT EXISTS allowed_workspaces uuid[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS allowed_boards uuid[] DEFAULT '{}';

-- Optional: Update an existing user to be the admin
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'your_admin_email@example.com';
