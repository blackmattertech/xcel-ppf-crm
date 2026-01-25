# Setup Guide

## Step 1: Run Database Migrations

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/iwmqkqaduidkjacgefpk)
2. Navigate to **SQL Editor**
3. Open `database/migrations/000_combined_migration.sql` (or run each migration file in order)
4. Copy the entire contents
5. Paste into SQL Editor
6. Click **Run**

This will create all necessary tables, roles, and permissions.

## Step 2: Create Initial Admin Users

After migrations are complete, create your first admin users:

### Option A: Using the Script (Recommended)

```bash
# Create a Super Admin
npx tsx scripts/create-admin.ts superadmin@xcel.com "SuperAdmin123" "Super Admin" super_admin

# Create an Admin
npx tsx scripts/create-admin.ts admin@xcel.com "Admin123" "Admin User" admin
```

### Option B: Manual Creation via Supabase Dashboard

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add User" → "Create new user"
3. Enter email and password
4. Go to SQL Editor and run:

```sql
-- Replace 'USER_EMAIL' with the email you just created
-- Replace 'ROLE_NAME' with 'super_admin' or 'admin'

INSERT INTO public.users (id, email, name, role_id)
SELECT 
  auth.users.id,
  auth.users.email,
  'Admin User',
  roles.id
FROM auth.users
CROSS JOIN public.roles
WHERE auth.users.email = 'USER_EMAIL'
  AND roles.name = 'ROLE_NAME'
ON CONFLICT (id) DO NOTHING;
```

## Step 3: Login and Create More Roles

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Go to http://localhost:3000/login

3. Login with your admin credentials

4. Navigate to **Roles** in the navigation menu

5. Click **Create New Role** button

6. Fill in:
   - Role Name (e.g., `sales_manager`)
   - Description
   - Select permissions for this role

7. Click **Create Role**

## Step 4: Create Users with Custom Roles

1. Navigate to **Users** in the navigation menu

2. Click **Create New User** button

3. Fill in:
   - Name
   - Email
   - Password (minimum 6 characters)
   - Phone (optional)
   - Select a role (including your newly created custom roles)

4. Click **Create User**

## Available System Roles

- **super_admin**: Full system access, can manage everything including roles
- **admin**: Can manage users and most features, but cannot manage roles
- **marketing**: Read-only access to leads, customers, and analytics
- **tele_caller**: Full access to leads, read-only access to customers

## Permission System

Each role has specific permissions:
- `leads.*` - Lead management permissions
- `users.*` - User management permissions
- `roles.*` - Role management permissions (super_admin only)
- `customers.*` - Customer management permissions
- `orders.*` - Order management permissions
- `quotations.*` - Quotation management permissions
- `analytics.*` - Analytics viewing permissions

When creating custom roles, you can assign any combination of these permissions.

## Step 5: Configure Forgot Password Email Template

The forgot password functionality uses Supabase's email templates. To customize the password reset email:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Authentication** → **Email Templates**
3. Select the **Recovery** template (for password reset)
4. Customize the email template with your branding

### Available Template Variables

You can use these variables in your email template:
- `{{ .ConfirmationURL }}` - The password reset link
- `{{ .Token }}` - 6-digit OTP (if using OTP instead of link)
- `{{ .TokenHash }}` - Hashed token for custom email links
- `{{ .SiteURL }}` - Your application's Site URL
- `{{ .RedirectTo }}` - Redirect URL (should be `/reset-password`)
- `{{ .Email }}` - User's email address
- `{{ .Data }}` - User metadata for personalization

### Configure Redirect URLs

1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL** to your production URL (e.g., `https://yourdomain.com`)
3. Add **Redirect URLs**:
   - `http://localhost:3000/reset-password` (for development)
   - `https://yourdomain.com/reset-password` (for production)

### Example Email Template

```html
<h2>Reset Your Password</h2>
<p>Click the link below to reset your password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>Or copy and paste this URL into your browser:</p>
<p>{{ .ConfirmationURL }}</p>
<p>This link will expire in 1 hour.</p>
<p>If you didn't request this, please ignore this email.</p>
```

## Troubleshooting

### "Role not found" error
- Make sure you've run all database migrations
- Check that migration `002_roles_permissions.sql` ran successfully

### "User already exists" error
- The email is already registered
- Use a different email or delete the existing user first

### Cannot login
- Verify environment variables in `.env.local`
- Check that the user was created in both `auth.users` and `public.users` tables
- Ensure the user has a valid role assigned

### Password reset email not received
- Check spam/junk folder
- Verify email template is configured in Supabase dashboard
- Ensure redirect URLs are configured correctly
- Check that `NEXT_PUBLIC_SITE_URL` environment variable is set (or it will default to localhost)
