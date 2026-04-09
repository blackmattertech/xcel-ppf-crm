-- =============================================================================
-- CONSOLIDATED FULL SCHEMA (all incremental migrations merged)
-- =============================================================================
-- Use case: apply once to a NEW empty Supabase project when moving accounts.
-- This file replays database/migrations/001 through 045 in order.
--
-- NOT included (do separately):
--   - Auth users / row data (use backup restore or pg_dump if migrating data)
--   - Supabase Storage buckets and files
--   - Edge Functions deploy: supabase functions deploy process-whatsapp-scheduled
--   - Meta / Facebook: new App ID, secrets in .env; reconnect OAuth in Settings;
--     WhatsApp WABA + tokens stored in whatsapp_business_settings / facebook_business_settings
-- Migration 033 was empty in the repo (skipped below).
-- Section 032 (pg_cron): DEFERRED — run database/post_migration_supabase_setup.sql AFTER
--   vault secrets + Edge Function deploy (otherwise cron calls a NULL URL).
-- =============================================================================


-- ---------- 001_initial_schema.sql ----------
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    name TEXT NOT NULL,
    role_id UUID NOT NULL,
    branch_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create roles table
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_system_role BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    UNIQUE(resource, action)
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Add foreign key constraint for users.role_id
ALTER TABLE public.users ADD CONSTRAINT users_role_id_fkey 
    FOREIGN KEY (role_id) REFERENCES public.roles(id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON public.roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- 002_roles_permissions.sql ----------
-- Insert system roles
INSERT INTO public.roles (id, name, description, is_system_role) VALUES
    (uuid_generate_v4(), 'super_admin', 'Super Administrator with full system access', TRUE),
    (uuid_generate_v4(), 'admin', 'Administrator with management capabilities', TRUE),
    (uuid_generate_v4(), 'marketing', 'Marketing team member', TRUE),
    (uuid_generate_v4(), 'tele_caller', 'Tele-caller role for lead management', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Insert base permissions
INSERT INTO public.permissions (name, resource, action, description) VALUES
    -- Leads permissions
    ('leads.create', 'leads', 'create', 'Create new leads'),
    ('leads.read', 'leads', 'read', 'View leads'),
    ('leads.update', 'leads', 'update', 'Update lead information'),
    ('leads.delete', 'leads', 'delete', 'Delete leads'),
    ('leads.manage', 'leads', 'manage', 'Full lead management access'),
    
    -- Users permissions
    ('users.create', 'users', 'create', 'Create new users'),
    ('users.read', 'users', 'read', 'View users'),
    ('users.update', 'users', 'update', 'Update user information'),
    ('users.delete', 'users', 'delete', 'Delete users'),
    ('users.manage', 'users', 'manage', 'Full user management access'),
    
    -- Roles permissions
    ('roles.create', 'roles', 'create', 'Create new roles'),
    ('roles.read', 'roles', 'read', 'View roles'),
    ('roles.update', 'roles', 'update', 'Update role information'),
    ('roles.delete', 'roles', 'delete', 'Delete roles'),
    ('roles.manage', 'roles', 'manage', 'Full role management access'),
    
    -- Customers permissions
    ('customers.create', 'customers', 'create', 'Create new customers'),
    ('customers.read', 'customers', 'read', 'View customers'),
    ('customers.update', 'customers', 'update', 'Update customer information'),
    ('customers.delete', 'customers', 'delete', 'Delete customers'),
    ('customers.manage', 'customers', 'manage', 'Full customer management access'),
    
    -- Orders permissions
    ('orders.create', 'orders', 'create', 'Create new orders'),
    ('orders.read', 'orders', 'read', 'View orders'),
    ('orders.update', 'orders', 'update', 'Update order information'),
    ('orders.delete', 'orders', 'delete', 'Delete orders'),
    ('orders.manage', 'orders', 'manage', 'Full order management access'),
    
    -- Quotations permissions
    ('quotations.create', 'quotations', 'create', 'Create new quotations'),
    ('quotations.read', 'quotations', 'read', 'View quotations'),
    ('quotations.update', 'quotations', 'update', 'Update quotation information'),
    ('quotations.delete', 'quotations', 'delete', 'Delete quotations'),
    ('quotations.manage', 'quotations', 'manage', 'Full quotation management access'),
    
    -- Analytics permissions
    ('analytics.read', 'analytics', 'read', 'View analytics'),
    ('analytics.manage', 'analytics', 'manage', 'Full analytics access')
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to super_admin (all permissions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Assign permissions to admin (most permissions except role management)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'admin'
    AND p.name NOT LIKE 'roles.%'
ON CONFLICT DO NOTHING;

-- Assign permissions to marketing (leads read, customers read, analytics read)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'marketing'
    AND p.name IN ('leads.read', 'leads.create', 'customers.read', 'analytics.read')
ON CONFLICT DO NOTHING;

-- Assign permissions to tele_caller (leads full access, customers read)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'tele_caller'
    AND (p.name LIKE 'leads.%' OR p.name = 'customers.read')
ON CONFLICT DO NOTHING;

-- ---------- 003_leads_system.sql ----------
-- Create leads table
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    source TEXT NOT NULL CHECK (source IN ('meta', 'manual', 'form', 'whatsapp', 'ivr')),
    campaign_id TEXT,
    ad_id TEXT,
    adset_id TEXT,
    form_id TEXT,
    form_name TEXT,
    ad_name TEXT,
    campaign_name TEXT,
    meta_data JSONB,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'unqualified', 'quotation_shared', 'interested', 'negotiation', 'lost', 'converted')),
    interest_level TEXT CHECK (interest_level IN ('hot', 'warm', 'cold')),
    budget_range TEXT,
    requirement TEXT,
    timeline TEXT,
    assigned_to UUID REFERENCES public.users(id),
    branch_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    first_contact_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ
);

-- Create unique index on phone
CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_unique ON public.leads(phone) WHERE phone IS NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads(status);
CREATE INDEX IF NOT EXISTS leads_source_idx ON public.leads(source);
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads(created_at);

-- Create lead_status_history table
CREATE TABLE IF NOT EXISTS public.lead_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID NOT NULL REFERENCES public.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for lead_status_history
CREATE INDEX IF NOT EXISTS lead_status_history_lead_id_idx ON public.lead_status_history(lead_id);
CREATE INDEX IF NOT EXISTS lead_status_history_created_at_idx ON public.lead_status_history(created_at);

-- Create calls table
CREATE TABLE IF NOT EXISTS public.calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    called_by UUID NOT NULL REFERENCES public.users(id),
    outcome TEXT NOT NULL CHECK (outcome IN ('connected', 'not_reachable', 'wrong_number', 'call_later')),
    disposition TEXT,
    notes TEXT,
    call_duration INTEGER, -- in seconds
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for calls
CREATE INDEX IF NOT EXISTS calls_lead_id_idx ON public.calls(lead_id);
CREATE INDEX IF NOT EXISTS calls_called_by_idx ON public.calls(called_by);
CREATE INDEX IF NOT EXISTS calls_created_at_idx ON public.calls(created_at);

-- Create assignments table for round-robin
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    lead_source TEXT NOT NULL CHECK (lead_source IN ('meta', 'manual', 'form')),
    last_assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assignment_count INTEGER DEFAULT 0,
    UNIQUE(user_id, lead_source)
);

-- Create indexes for assignments
CREATE INDEX IF NOT EXISTS assignments_user_id_idx ON public.assignments(user_id);
CREATE INDEX IF NOT EXISTS assignments_lead_source_idx ON public.assignments(lead_source);
CREATE INDEX IF NOT EXISTS assignments_last_assigned_at_idx ON public.assignments(lead_source, last_assigned_at);

-- Create trigger for updated_at on leads
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- 004_followups_quotations.sql ----------
-- Create follow_ups table
CREATE TABLE IF NOT EXISTS public.follow_ups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    assigned_to UUID NOT NULL REFERENCES public.users(id),
    scheduled_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'rescheduled', 'no_response')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for follow_ups
CREATE INDEX IF NOT EXISTS follow_ups_lead_id_idx ON public.follow_ups(lead_id);
CREATE INDEX IF NOT EXISTS follow_ups_assigned_to_idx ON public.follow_ups(assigned_to);
CREATE INDEX IF NOT EXISTS follow_ups_scheduled_at_idx ON public.follow_ups(scheduled_at);
CREATE INDEX IF NOT EXISTS follow_ups_status_idx ON public.follow_ups(status);
CREATE INDEX IF NOT EXISTS follow_ups_pending_idx ON public.follow_ups(scheduled_at, status) WHERE status = 'pending';

-- Create quotations table
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    quote_number TEXT NOT NULL UNIQUE,
    version INTEGER NOT NULL DEFAULT 1,
    items JSONB NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) DEFAULT 0,
    gst DECIMAL(10, 2) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    validity_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'viewed', 'accepted', 'expired')),
    pdf_url TEXT,
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for quotations
CREATE INDEX IF NOT EXISTS quotations_lead_id_idx ON public.quotations(lead_id);
CREATE INDEX IF NOT EXISTS quotations_quote_number_idx ON public.quotations(quote_number);
CREATE INDEX IF NOT EXISTS quotations_status_idx ON public.quotations(status);
CREATE INDEX IF NOT EXISTS quotations_created_by_idx ON public.quotations(created_by);
CREATE INDEX IF NOT EXISTS quotations_validity_date_idx ON public.quotations(validity_date);

-- Create trigger for updated_at on follow_ups
CREATE TRIGGER update_follow_ups_updated_at BEFORE UPDATE ON public.follow_ups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for updated_at on quotations
CREATE TRIGGER update_quotations_updated_at BEFORE UPDATE ON public.quotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- 005_customers_orders.sql ----------
-- Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES public.leads(id),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    customer_type TEXT NOT NULL DEFAULT 'new' CHECK (customer_type IN ('new', 'repeat', 'high_value')),
    tags JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index on phone for customers
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique ON public.customers(phone) WHERE phone IS NOT NULL;

-- Create indexes for customers
CREATE INDEX IF NOT EXISTS customers_lead_id_idx ON public.customers(lead_id);
CREATE INDEX IF NOT EXISTS customers_customer_type_idx ON public.customers(customer_type);
CREATE INDEX IF NOT EXISTS customers_created_at_idx ON public.customers(created_at);

-- Create orders table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id),
    order_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'advance_received', 'fully_paid')),
    assigned_team TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for orders
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_lead_id_idx ON public.orders(lead_id);
CREATE INDEX IF NOT EXISTS orders_order_number_idx ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON public.orders(payment_status);

-- Create trigger for updated_at on customers
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for updated_at on orders
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- 006_indexes_triggers.sql ----------
-- Function to generate lead_id
CREATE OR REPLACE FUNCTION generate_lead_id()
RETURNS TRIGGER AS $$
DECLARE
    new_lead_id TEXT;
    counter INTEGER := 1;
BEGIN
    LOOP
        new_lead_id := 'LEAD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 4, '0');
        
        -- Check if this lead_id already exists
        IF NOT EXISTS (SELECT 1 FROM public.leads WHERE lead_id = new_lead_id) THEN
            NEW.lead_id := new_lead_id;
            EXIT;
        END IF;
        
        counter := counter + 1;
        
        -- Safety check to prevent infinite loop
        IF counter > 9999 THEN
            RAISE EXCEPTION 'Unable to generate unique lead_id';
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate lead_id if not provided
CREATE TRIGGER generate_lead_id_trigger
    BEFORE INSERT ON public.leads
    FOR EACH ROW
    WHEN (NEW.lead_id IS NULL OR NEW.lead_id = '')
    EXECUTE FUNCTION generate_lead_id();

-- Function to log lead status changes
CREATE OR REPLACE FUNCTION log_lead_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.lead_status_history (lead_id, old_status, new_status, changed_by)
        VALUES (NEW.id, OLD.status, NEW.status, NEW.assigned_to);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log status changes
CREATE TRIGGER log_lead_status_change_trigger
    AFTER UPDATE OF status ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION log_lead_status_change();

-- Function to update first_contact_at when call is logged
CREATE OR REPLACE FUNCTION update_first_contact_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.leads
    SET first_contact_at = COALESCE(first_contact_at, NOW())
    WHERE id = NEW.lead_id AND first_contact_at IS NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update first_contact_at
CREATE TRIGGER update_first_contact_at_trigger
    AFTER INSERT ON public.calls
    FOR EACH ROW
    EXECUTE FUNCTION update_first_contact_at();

-- Function to auto-expire quotations
CREATE OR REPLACE FUNCTION expire_quotations()
RETURNS void AS $$
BEGIN
    UPDATE public.quotations
    SET status = 'expired'
    WHERE validity_date < CURRENT_DATE
    AND status NOT IN ('accepted', 'expired');
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security (RLS) policies will be added in application code
-- For now, we'll rely on application-level security

-- Create function to get next user for round-robin assignment
CREATE OR REPLACE FUNCTION get_next_assigned_user(p_lead_source TEXT)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Get the user with the oldest last_assigned_at for this source
    SELECT user_id INTO v_user_id
    FROM public.assignments
    WHERE lead_source = p_lead_source
    ORDER BY last_assigned_at ASC, assignment_count ASC
    LIMIT 1;
    
    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- ---------- 007_lead_lifecycle_statuses.sql ----------
-- Migration to add new lead lifecycle statuses
-- This migration updates the leads table to support the comprehensive lead lifecycle

-- First, drop the existing check constraint
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Add new check constraint with all lifecycle statuses
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check 
  CHECK (status IN (
    'new', 
    'qualified', 
    'unqualified', 
    'quotation_shared',
    'quotation_viewed',
    'quotation_accepted',
    'quotation_expired',
    'interested', 
    'negotiation', 
    'lost', 
    'converted',
    'deal_won',
    'payment_pending',
    'advance_received',
    'fully_paid'
  ));

-- Add payment tracking fields if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN payment_status TEXT CHECK (payment_status IN ('pending', 'advance_received', 'fully_paid'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'payment_amount'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN payment_amount DECIMAL(10, 2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'advance_amount'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN advance_amount DECIMAL(10, 2);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'lost_reason'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN lost_reason TEXT;
  END IF;
END $$;

-- Create index on payment_status if it doesn't exist
CREATE INDEX IF NOT EXISTS leads_payment_status_idx ON public.leads(payment_status);

-- ---------- 008_user_profile_fields.sql ----------
-- Migration to add user profile fields
-- This migration adds profile_image_url, address, dob (date of birth), and doj (date of joining) to users table

-- Add profile_image_url column (stores the path/URL to the image in Supabase storage)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'profile_image_url'
  ) THEN
    ALTER TABLE public.users ADD COLUMN profile_image_url TEXT;
  END IF;
END $$;

-- Add address column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'address'
  ) THEN
    ALTER TABLE public.users ADD COLUMN address TEXT;
  END IF;
END $$;

-- Add dob (date of birth) column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'dob'
  ) THEN
    ALTER TABLE public.users ADD COLUMN dob DATE;
  END IF;
END $$;

-- Add doj (date of joining) column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'doj'
  ) THEN
    ALTER TABLE public.users ADD COLUMN doj DATE;
  END IF;
END $$;

-- Create index on profile_image_url for faster lookups
CREATE INDEX IF NOT EXISTS users_profile_image_url_idx ON public.users(profile_image_url) WHERE profile_image_url IS NOT NULL;

-- ---------- 009_products.sql ----------
-- Create products table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    mrp DECIMAL(10, 2) NOT NULL,
    image_url TEXT,
    sku TEXT UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for products
CREATE INDEX IF NOT EXISTS products_title_idx ON public.products(title);
CREATE INDEX IF NOT EXISTS products_sku_idx ON public.products(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_is_active_idx ON public.products(is_active);
CREATE INDEX IF NOT EXISTS products_created_at_idx ON public.products(created_at);

-- Create trigger for updated_at on products
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add product_id to orders table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'product_id'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN product_id UUID REFERENCES public.products(id);
        CREATE INDEX IF NOT EXISTS orders_product_id_idx ON public.orders(product_id);
    END IF;
END $$;

-- ---------- 010_facebook_business_integration.sql ----------
-- Create Facebook Business integration settings table
CREATE TABLE IF NOT EXISTS public.facebook_business_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    access_token TEXT NOT NULL,
    page_id TEXT,
    page_name TEXT,
    ad_account_id TEXT,
    ad_account_name TEXT,
    business_id TEXT,
    business_name TEXT,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id)
);

-- Create index for active connections
CREATE INDEX IF NOT EXISTS facebook_business_settings_active_idx ON public.facebook_business_settings(is_active) WHERE is_active = true;

-- Create index for created_by
CREATE INDEX IF NOT EXISTS facebook_business_settings_created_by_idx ON public.facebook_business_settings(created_by);

-- Create trigger for updated_at (drop first so migration is idempotent)
DROP TRIGGER IF EXISTS update_facebook_business_settings_updated_at ON public.facebook_business_settings;
CREATE TRIGGER update_facebook_business_settings_updated_at
    BEFORE UPDATE ON public.facebook_business_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------- 010_sync_permissions_from_sidebar.sql ----------
-- Migration to sync permissions from sidebar configuration
-- This ensures permissions exist for all resources defined in the sidebar
-- Run this migration after adding new features to the sidebar

-- Insert permissions for followups (if not exists)
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('followups.create', 'followups', 'create', 'Create new followups'),
    ('followups.read', 'followups', 'read', 'View followups'),
    ('followups.update', 'followups', 'update', 'Update followup information'),
    ('followups.delete', 'followups', 'delete', 'Delete followups'),
    ('followups.manage', 'followups', 'manage', 'Full followup management access')
ON CONFLICT (name) DO NOTHING;

-- Note: Products permissions should already exist from migration 009
-- But we'll ensure they exist here as well
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('products.create', 'products', 'create', 'Create new products'),
    ('products.read', 'products', 'read', 'View products'),
    ('products.update', 'products', 'update', 'Update product information'),
    ('products.delete', 'products', 'delete', 'Delete products'),
    ('products.manage', 'products', 'manage', 'Full product management access')
ON CONFLICT (name) DO NOTHING;

-- Assign followups permissions to tele_caller
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'tele_caller'
    AND p.name LIKE 'followups.%'
ON CONFLICT DO NOTHING;

-- Assign followups.read to admin and super_admin (they already have all permissions, but ensure it)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('admin', 'super_admin')
    AND p.name LIKE 'followups.%'
ON CONFLICT DO NOTHING;

-- ---------- 011_lead_journey_statuses.sql ----------
-- Migration to add Lead Journey statuses: contacted and discarded
-- This migration updates the leads table to support the complete Lead Journey flow

-- Drop the existing check constraint
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Add new check constraint with all lifecycle statuses including contacted and discarded
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check 
  CHECK (status IN (
    'new', 
    'contacted',        -- NEW: After first call attempt
    'qualified', 
    'unqualified', 
    'quotation_shared',
    'quotation_viewed',
    'quotation_accepted',
    'quotation_expired',
    'interested', 
    'negotiation', 
    'lost',             -- Used for discarded leads
    'discarded',        -- NEW: Explicit discarded status (maps to lost in some contexts)
    'converted',
    'deal_won',
    'payment_pending',
    'advance_received',
    'fully_paid'
  ));

-- Add quotation rejection reason field to quotations table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotations' AND column_name = 'rejection_reason'
  ) THEN
    ALTER TABLE public.quotations ADD COLUMN rejection_reason TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotations' AND column_name = 'rejected_at'
  ) THEN
    ALTER TABLE public.quotations ADD COLUMN rejected_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotations' AND column_name = 'rejected_by'
  ) THEN
    ALTER TABLE public.quotations ADD COLUMN rejected_by UUID REFERENCES public.users(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotations' AND column_name = 'admin_notified'
  ) THEN
    ALTER TABLE public.quotations ADD COLUMN admin_notified BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Create index on rejection fields for admin notifications
CREATE INDEX IF NOT EXISTS quotations_rejection_idx ON public.quotations(rejected_at, admin_notified) 
  WHERE rejection_reason IS NOT NULL;

-- Add comment explaining the Lead Journey flow
COMMENT ON COLUMN public.leads.status IS 'Lead Journey Status: new -> contacted -> qualified -> negotiation -> deal_won | lost/discarded';

-- ---------- 012_add_languages_known_to_users.sql ----------
-- Add languages_known column to users table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'languages_known'
  ) THEN
    ALTER TABLE public.users ADD COLUMN languages_known TEXT[];
  END IF;
END $$;

-- ---------- 013_mailjet_integration.sql ----------
-- Mailjet integration settings (single global config)

create table if not exists public.mailjet_settings (
  id integer primary key,
  api_key text not null,
  api_secret text not null,
  sender_email text not null,
  updated_at timestamptz not null default now()
);


-- ---------- 014_sidebar_permissions_full_sync.sql ----------
-- Sync ALL sidebar options to permissions table so you can give access to users via roles.
-- Every sidebar resource gets .read and .manage; .read is enough to show the menu item.

-- Dashboard (currently requiresPermissions: false; add permission so access can be granted/revoked)
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('dashboard.read', 'dashboard', 'read', 'View dashboard'),
    ('dashboard.manage', 'dashboard', 'manage', 'Full dashboard access')
ON CONFLICT (name) DO NOTHING;

-- Sales pipeline
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('sales.read', 'sales', 'read', 'View sales pipeline'),
    ('sales.manage', 'sales', 'manage', 'Full sales pipeline access')
ON CONFLICT (name) DO NOTHING;

-- Communication
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('communication.read', 'communication', 'read', 'View communication'),
    ('communication.manage', 'communication', 'manage', 'Full communication access')
ON CONFLICT (name) DO NOTHING;

-- Marketing
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('marketing.read', 'marketing', 'read', 'View marketing'),
    ('marketing.manage', 'marketing', 'manage', 'Full marketing access')
ON CONFLICT (name) DO NOTHING;

-- Teams
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('teams.read', 'teams', 'read', 'View teams'),
    ('teams.manage', 'teams', 'manage', 'Full teams access')
ON CONFLICT (name) DO NOTHING;

-- Reports
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('reports.read', 'reports', 'read', 'View reports'),
    ('reports.manage', 'reports', 'manage', 'Full reports access')
ON CONFLICT (name) DO NOTHING;

-- Integrations
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('integrations.read', 'integrations', 'read', 'View integrations'),
    ('integrations.manage', 'integrations', 'manage', 'Full integrations access')
ON CONFLICT (name) DO NOTHING;

-- Ensure followups and products exist (may already be in 010)
INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('followups.create', 'followups', 'create', 'Create new followups'),
    ('followups.read', 'followups', 'read', 'View followups'),
    ('followups.update', 'followups', 'update', 'Update followup information'),
    ('followups.delete', 'followups', 'delete', 'Delete followups'),
    ('followups.manage', 'followups', 'manage', 'Full followup management access'),
    ('products.create', 'products', 'create', 'Create new products'),
    ('products.read', 'products', 'read', 'View products'),
    ('products.update', 'products', 'update', 'Update product information'),
    ('products.delete', 'products', 'delete', 'Delete products'),
    ('products.manage', 'products', 'manage', 'Full product management access')
ON CONFLICT (name) DO NOTHING;

-- Grant new sidebar permissions to tele_caller and marketing so they keep seeing these items.
-- You can revoke or grant any of these in Admin > Roles & Permissions.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name IN ('tele_caller', 'marketing')
  AND p.name IN (
    'dashboard.read', 'sales.read', 'communication.read', 'marketing.read',
    'teams.read', 'reports.read', 'integrations.read'
  )
ON CONFLICT DO NOTHING;

-- ---------- 015_user_push_tokens.sql ----------
-- Store FCM (Firebase Cloud Messaging) tokens per user for PWA push notifications.
-- One user can have multiple devices/browsers.

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    device_label TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(fcm_token)
);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_id_idx ON public.user_push_tokens(user_id);

CREATE TRIGGER update_user_push_tokens_updated_at
    BEFORE UPDATE ON public.user_push_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.user_push_tokens IS 'FCM tokens for PWA push notifications per user/device';

-- ---------- 015_user_delete_cascade_fks.sql ----------
-- Migration: Add ON DELETE behavior to foreign keys referencing users
-- This allows user deletion without manual clearing of references.
-- Nullable columns: SET NULL. NOT NULL columns: handled by app or CASCADE.

-- 1. leads.assigned_to (nullable) -> ON DELETE SET NULL
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. roles.created_by (nullable) -> ON DELETE SET NULL
ALTER TABLE public.roles
  DROP CONSTRAINT IF EXISTS roles_created_by_fkey;
ALTER TABLE public.roles
  ADD CONSTRAINT roles_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- 3. quotations.rejected_by (nullable, if column exists) -> ON DELETE SET NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotations' AND column_name = 'rejected_by'
  ) THEN
    ALTER TABLE public.quotations DROP CONSTRAINT IF EXISTS quotations_rejected_by_fkey;
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_rejected_by_fkey
      FOREIGN KEY (rejected_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. facebook_business_settings.created_by (nullable, if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'facebook_business_settings') THEN
    ALTER TABLE public.facebook_business_settings DROP CONSTRAINT IF EXISTS facebook_business_settings_created_by_fkey;
    ALTER TABLE public.facebook_business_settings
      ADD CONSTRAINT facebook_business_settings_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. products.created_by (nullable, if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_created_by_fkey;
    ALTER TABLE public.products
      ADD CONSTRAINT products_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. lead_activities.performed_by (if table exists)
-- SET NULL requires nullable column; alter to nullable first if needed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_activities') THEN
    ALTER TABLE public.lead_activities DROP CONSTRAINT IF EXISTS lead_activities_performed_by_fkey;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lead_activities' AND column_name = 'performed_by'
        AND is_nullable = 'NO'
    ) THEN
      ALTER TABLE public.lead_activities ALTER COLUMN performed_by DROP NOT NULL;
    END IF;
    ALTER TABLE public.lead_activities
      ADD CONSTRAINT lead_activities_performed_by_fkey
      FOREIGN KEY (performed_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------- 016_facebook_page_access_token.sql ----------
-- Page Access Token is required for leadgen API (/{page-id}/leadgen_forms, /{form-id}/leads).
-- User token remains in access_token for Marketing API (ads insights, campaigns).
ALTER TABLE public.facebook_business_settings
ADD COLUMN IF NOT EXISTS page_access_token TEXT;

COMMENT ON COLUMN public.facebook_business_settings.page_access_token IS 'Page Access Token for leadgen forms/leads API; access_token is User token for ads API';

-- ---------- 017_whatsapp_templates.sql ----------
-- WhatsApp message templates (design, submit to Meta, use for bulk broadcast)
-- Template name must be unique per language; status tracks Meta review.

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  language text not null default 'en',
  category text not null check (category in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  body_text text not null,
  header_text text,
  footer_text text,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  meta_id text,
  rejection_reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, language)
);

create index if not exists idx_whatsapp_templates_status on public.whatsapp_templates(status);
create index if not exists idx_whatsapp_templates_created_by on public.whatsapp_templates(created_by);

comment on table public.whatsapp_templates is 'WhatsApp message templates for bulk broadcast; submit to Meta for approval.';

-- ---------- 018_whatsapp_templates_media_buttons.sql ----------
-- Add header media and buttons support for WhatsApp message templates

alter table public.whatsapp_templates
  add column if not exists header_format text default 'TEXT' check (header_format in ('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT')),
  add column if not exists header_media_url text,
  add column if not exists buttons jsonb default '[]'::jsonb;

comment on column public.whatsapp_templates.header_format is 'HEADER type: TEXT or IMAGE, VIDEO, DOCUMENT';
comment on column public.whatsapp_templates.header_media_url is 'Sample media URL for header (required for IMAGE/VIDEO/DOCUMENT)';
comment on column public.whatsapp_templates.buttons is 'Array of { type: QUICK_REPLY|URL|PHONE_NUMBER|COPY_CODE, text: string, example?: string }';

-- ---------- 019_whatsapp_messages.sql ----------
-- WhatsApp chat messages (sent + received) for CRM conversation history
-- Incoming messages are stored via webhook; outgoing when sent from Chat tab
-- Uses gen_random_uuid() for compatibility (no extension required; Postgres 13+)

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  phone text not null,
  direction text not null check (direction in ('out', 'in')),
  body text not null,
  meta_message_id text,
  created_at timestamptz default now()
);

-- If table already existed without phone (e.g. partial run), add the column
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'whatsapp_messages' and column_name = 'phone'
  ) then
    alter table public.whatsapp_messages add column phone text not null default '';
  end if;
end $$;

create index if not exists idx_whatsapp_messages_lead_id on public.whatsapp_messages(lead_id);
create index if not exists idx_whatsapp_messages_phone on public.whatsapp_messages(phone);
create index if not exists idx_whatsapp_messages_created_at on public.whatsapp_messages(created_at);

comment on table public.whatsapp_messages is 'WhatsApp conversation history: outgoing (sent from CRM) and incoming (from webhook).';

-- ---------- 020_whatsapp_messages_meta_message_id.sql ----------
-- Add meta_message_id to whatsapp_messages if missing (PGRST204: column not in schema cache)
-- Table may have been created before 019 included this column, or by an older migration

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'whatsapp_messages' and column_name = 'meta_message_id'
  ) then
    alter table public.whatsapp_messages add column meta_message_id text;
  end if;
end $$;

-- ---------- 021_fix_whatsapp_messages_direction_constraint.sql ----------
-- Fix direction check constraint (23514): ensure it accepts 'out' and 'in'
-- Table may have been created with different constraint values (e.g. uppercase)

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_direction_check;
alter table public.whatsapp_messages add constraint whatsapp_messages_direction_check
  check (direction in ('out', 'in'));

-- ---------- 022_whatsapp_messages_status.sql ----------
-- Add status column for sent/delivered/read receipts (outgoing messages only)
-- Status updates come from WhatsApp webhook (value.statuses)

alter table public.whatsapp_messages add column if not exists status text;

-- sent < delivered < read (only outgoing messages have status)
comment on column public.whatsapp_messages.status is 'Delivery status for outgoing: sent, delivered, read. Updated via webhook.';

-- ---------- 023_whatsapp_business_settings.sql ----------
-- WhatsApp Business integration settings (link WABA from frontend)
CREATE TABLE IF NOT EXISTS public.whatsapp_business_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    waba_id TEXT NOT NULL,
    waba_name TEXT,
    phone_number_id TEXT NOT NULL,
    phone_number_display TEXT,
    access_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS whatsapp_business_settings_active_idx ON public.whatsapp_business_settings(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS whatsapp_business_settings_created_by_idx ON public.whatsapp_business_settings(created_by);

DROP TRIGGER IF EXISTS update_whatsapp_business_settings_updated_at ON public.whatsapp_business_settings;
CREATE TRIGGER update_whatsapp_business_settings_updated_at
    BEFORE UPDATE ON public.whatsapp_business_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.whatsapp_business_settings IS 'WhatsApp Business Account config linked from frontend; env vars used as fallback.';

-- ---------- 024_whatsapp_templates_header_media_id.sql ----------
-- Store Meta upload media ID for template header (from Resumable Upload API).
-- Use this when sending template so we send image: { id } instead of link.

alter table public.whatsapp_templates
  add column if not exists header_media_id text;

comment on column public.whatsapp_templates.header_media_id is 'Meta media attachment ID from Resumable Upload API; use when sending template (image/video/document).';

-- ---------- 025_whatsapp_templates_sub_category.sql ----------
-- Add sub_category for Meta template API (ORDER_DETAILS, ORDER_STATUS, RICH_ORDER_STATUS for UTILITY)
alter table public.whatsapp_templates
  add column if not exists sub_category text;

comment on column public.whatsapp_templates.sub_category is 'Meta sub-category for UTILITY templates: ORDER_DETAILS, ORDER_STATUS, RICH_ORDER_STATUS. Null for standard templates.';

-- ---------- 026_whatsapp_template_drafts.sql ----------
-- WhatsApp template drafts: in-progress templates before submission to Meta.
-- Supports STANDARD, AUTHENTICATION_OTP, CALL_PERMISSION_REQUEST, CATALOG, LIMITED_TIME_OFFER, PRODUCT_CARD_CAROUSEL.

CREATE TABLE IF NOT EXISTS public.whatsapp_template_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  waba_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  template_subtype TEXT NOT NULL DEFAULT 'STANDARD' CHECK (template_subtype IN (
    'STANDARD', 'AUTHENTICATION_OTP', 'CALL_PERMISSION_REQUEST',
    'CATALOG', 'LIMITED_TIME_OFFER', 'PRODUCT_CARD_CAROUSEL'
  )),
  mode TEXT DEFAULT 'custom' CHECK (mode IN ('custom', 'auth_bulk', 'auth_single')),
  name TEXT NOT NULL,
  language TEXT,
  languages_json JSONB,
  parameter_format TEXT CHECK (parameter_format IN ('named', 'positional')),
  components_json JSONB,
  normalized_template_json JSONB,
  validation_errors_json JSONB,
  validation_warnings_json JSONB,
  preview_json JSONB,
  submit_state TEXT NOT NULL DEFAULT 'draft' CHECK (submit_state IN (
    'draft', 'validation_failed', 'ready', 'submitted', 'failed'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_template_drafts_created_by ON public.whatsapp_template_drafts(created_by);
CREATE INDEX IF NOT EXISTS idx_whatsapp_template_drafts_submit_state ON public.whatsapp_template_drafts(submit_state);
CREATE INDEX IF NOT EXISTS idx_whatsapp_template_drafts_updated_at ON public.whatsapp_template_drafts(updated_at DESC);

DROP TRIGGER IF EXISTS update_whatsapp_template_drafts_updated_at ON public.whatsapp_template_drafts;
CREATE TRIGGER update_whatsapp_template_drafts_updated_at
  BEFORE UPDATE ON public.whatsapp_template_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.whatsapp_template_drafts IS 'Draft WhatsApp message templates before submission to Meta.';

-- ---------- 027_extend_whatsapp_templates.sql ----------
-- Extend whatsapp_templates for template management module: meta_template_id, template_subtype, components, status history.

ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS meta_template_id TEXT,
  ADD COLUMN IF NOT EXISTS correct_category TEXT,
  ADD COLUMN IF NOT EXISTS template_subtype TEXT DEFAULT 'STANDARD' CHECK (
    template_subtype IS NULL OR template_subtype IN (
      'STANDARD', 'AUTHENTICATION_OTP', 'CALL_PERMISSION_REQUEST',
      'CATALOG', 'LIMITED_TIME_OFFER', 'PRODUCT_CARD_CAROUSEL'
    )
  ),
  ADD COLUMN IF NOT EXISTS parameter_format TEXT,
  ADD COLUMN IF NOT EXISTS components_json JSONB,
  ADD COLUMN IF NOT EXISTS normalized_template_json JSONB,
  ADD COLUMN IF NOT EXISTS meta_status TEXT,
  ADD COLUMN IF NOT EXISTS quality_rating TEXT,
  ADD COLUMN IF NOT EXISTS submit_endpoint TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS languages_json JSONB;

-- Backfill: copy meta_id -> meta_template_id, status -> meta_status for existing rows
UPDATE public.whatsapp_templates
SET meta_template_id = COALESCE(meta_template_id, meta_id),
    meta_status = COALESCE(meta_status, status)
WHERE meta_template_id IS NULL AND meta_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_meta_template_id ON public.whatsapp_templates(meta_template_id) WHERE meta_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_template_subtype ON public.whatsapp_templates(template_subtype);

COMMENT ON COLUMN public.whatsapp_templates.meta_template_id IS 'Meta Graph API template ID. Same as meta_id; name aligned with plan.';
COMMENT ON COLUMN public.whatsapp_templates.template_subtype IS 'STANDARD, AUTHENTICATION_OTP, CALL_PERMISSION_REQUEST, CATALOG, LIMITED_TIME_OFFER, PRODUCT_CARD_CAROUSEL.';

-- ---------- 028_whatsapp_template_webhook_events.sql ----------
-- Store raw Meta webhook events for template status/category updates. Dedupe by dedupe_key.

CREATE TABLE IF NOT EXISTS public.whatsapp_template_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_id TEXT NOT NULL,
  meta_template_id TEXT,
  event_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_template_webhook_events_dedupe_key
  ON public.whatsapp_template_webhook_events(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_whatsapp_template_webhook_events_processed
  ON public.whatsapp_template_webhook_events(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_whatsapp_template_webhook_events_created_at
  ON public.whatsapp_template_webhook_events(created_at DESC);

COMMENT ON TABLE public.whatsapp_template_webhook_events IS 'Raw Meta webhook events for message_template_status_update, template_category_update.';

-- ---------- 029_whatsapp_template_status_history.sql ----------
-- History of template status/category changes from webhook, poll, or manual.

CREATE TABLE IF NOT EXISTS public.whatsapp_template_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_template_id UUID NOT NULL REFERENCES public.whatsapp_templates(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT,
  old_category TEXT,
  new_category TEXT,
  source TEXT NOT NULL CHECK (source IN ('webhook', 'poll', 'manual')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_template_status_history_template_id
  ON public.whatsapp_template_status_history(whatsapp_template_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_template_status_history_created_at
  ON public.whatsapp_template_status_history(created_at DESC);

COMMENT ON TABLE public.whatsapp_template_status_history IS 'Audit trail for template status and category changes.';

-- ---------- 030_marketing_dashboard_whatsapp_permissions.sql ----------
-- Marketing dropdown: Dashboard and WhatsApp as separate permission resources
-- so roles can be granted access to Marketing > Dashboard and/or Marketing > WhatsApp independently.

INSERT INTO public.permissions (name, resource, action, description) VALUES
    ('marketing_dashboard.read', 'marketing_dashboard', 'read', 'View marketing dashboard (overview)'),
    ('marketing_dashboard.manage', 'marketing_dashboard', 'manage', 'Full marketing dashboard access'),
    ('marketing_whatsapp.read', 'marketing_whatsapp', 'read', 'View WhatsApp (templates & bulk)'),
    ('marketing_whatsapp.manage', 'marketing_whatsapp', 'manage', 'Full WhatsApp templates & bulk access')
ON CONFLICT (name) DO NOTHING;

-- Grant to marketing role so existing marketing users see both Dashboard and WhatsApp
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'marketing'
  AND p.name IN ('marketing_dashboard.read', 'marketing_dashboard.manage', 'marketing_whatsapp.read', 'marketing_whatsapp.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ---------- 031_scheduled_broadcasts.sql ----------
-- Scheduled WhatsApp template broadcasts (processed by Supabase Edge Function process-whatsapp-scheduled, triggered by pg_cron)

CREATE TABLE IF NOT EXISTS public.scheduled_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_at TIMESTAMPTZ NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_json JSONB,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_broadcasts_status_scheduled_at
  ON public.scheduled_broadcasts(status, scheduled_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.scheduled_broadcasts IS 'WhatsApp template broadcasts to be sent at scheduled_at; processed by Supabase Edge Function process-whatsapp-scheduled (see migration 032 for pg_cron).';

-- ---------- 032_pg_cron_whatsapp_scheduled.sql (DEFERRED) ----------
-- Cron + Vault are in database/post_migration_supabase_setup.sql so a one-shot run of this
-- file does not register net.http_post with missing vault.decrypted_secrets.
-- After deploy: enable extensions (optional here), then run the post-migration file.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ---------- 033_whatsapp_header_send_media_id.sql (empty in repo) ----------
-- (no SQL)

-- ---------- 034_mcube_integration.sql ----------
-- MCUBE telephony: outbound sessions and extended call logs

CREATE TABLE IF NOT EXISTS public.mcube_outbound_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    initiated_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    mcube_call_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mcube_outbound_sessions_lead_id_idx ON public.mcube_outbound_sessions(lead_id);
CREATE INDEX IF NOT EXISTS mcube_outbound_sessions_initiated_by_idx ON public.mcube_outbound_sessions(initiated_by);
CREATE INDEX IF NOT EXISTS mcube_outbound_sessions_mcube_call_id_idx ON public.mcube_outbound_sessions(mcube_call_id) WHERE mcube_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mcube_outbound_sessions_created_at_idx ON public.mcube_outbound_sessions(created_at DESC);

ALTER TABLE public.calls
    ADD COLUMN IF NOT EXISTS mcube_call_id TEXT,
    ADD COLUMN IF NOT EXISTS recording_url TEXT,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS answered_duration_seconds INTEGER,
    ADD COLUMN IF NOT EXISTS dial_status TEXT,
    ADD COLUMN IF NOT EXISTS direction TEXT,
    ADD COLUMN IF NOT EXISTS disconnected_by TEXT,
    ADD COLUMN IF NOT EXISTS mcube_group_name TEXT,
    ADD COLUMN IF NOT EXISTS mcube_agent_name TEXT,
    ADD COLUMN IF NOT EXISTS integration TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS mcube_session_id UUID REFERENCES public.mcube_outbound_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_direction_check;
ALTER TABLE public.calls ADD CONSTRAINT calls_direction_check
    CHECK (direction IS NULL OR direction IN ('inbound', 'outbound'));

ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_integration_check;
ALTER TABLE public.calls ADD CONSTRAINT calls_integration_check
    CHECK (integration IN ('manual', 'mcube'));

CREATE UNIQUE INDEX IF NOT EXISTS calls_mcube_call_id_unique ON public.calls(mcube_call_id) WHERE mcube_call_id IS NOT NULL;

COMMENT ON COLUMN public.calls.integration IS 'manual: CRM-logged call; mcube: synced from MCUBE webhook';
COMMENT ON COLUMN public.calls.mcube_session_id IS 'Outbound session when call was initiated from CRM via MCUBE';

-- ---------- 035_mcube_settings.sql ----------
-- Global MCUBE behavior settings
CREATE TABLE IF NOT EXISTS public.mcube_settings (
    id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
    hide_connected_when_last_mcube_not_connected BOOLEAN NOT NULL DEFAULT true,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.mcube_settings (id, hide_connected_when_last_mcube_not_connected)
VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS update_mcube_settings_updated_at ON public.mcube_settings;
CREATE TRIGGER update_mcube_settings_updated_at
    BEFORE UPDATE ON public.mcube_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ---------- 036_crm_performance_rpcs.sql ----------
-- Aggregated counts and analytics to avoid transferring full row sets to the app tier.

CREATE OR REPLACE FUNCTION public.get_lead_counts_by_status(p_assigned_to uuid DEFAULT NULL)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(l.status, 'unknown')::text AS status, COUNT(*)::bigint AS cnt
  FROM public.leads l
  WHERE l.status IS DISTINCT FROM 'fully_paid'
    AND (p_assigned_to IS NULL OR l.assigned_to = p_assigned_to)
  GROUP BY l.status;
$$;

CREATE OR REPLACE FUNCTION public.get_analytics_dashboard(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_src jsonb;
  v_st jsonb;
  v_total int;
  v_conv int;
  v_rate numeric;
  v_rep jsonb;
  v_fu numeric;
  v_sla int;
  v_time jsonb;
  v_int jsonb;
  v_cprod jsonb;
  converted_arr text[] := ARRAY[
    'converted',
    'deal_won',
    'fully_paid',
    'advance_received',
    'payment_pending'
  ];
BEGIN
  SELECT COALESCE(jsonb_object_agg(sub.src, sub.c), '{}'::jsonb)
  INTO v_src
  FROM (
    SELECT COALESCE(l.source, 'unknown') AS src, COUNT(*)::int AS c
    FROM public.leads l
    WHERE l.created_at >= p_start AND l.created_at <= p_end
    GROUP BY l.source
  ) sub;

  SELECT COALESCE(jsonb_object_agg(sub.st, sub.c), '{}'::jsonb)
  INTO v_st
  FROM (
    SELECT COALESCE(l.status, 'unknown') AS st, COUNT(*)::int AS c
    FROM public.leads l
    WHERE l.created_at >= p_start AND l.created_at <= p_end
    GROUP BY l.status
  ) sub;

  SELECT COUNT(*)::int
  INTO v_total
  FROM public.leads l
  WHERE l.created_at >= p_start AND l.created_at <= p_end;

  SELECT COUNT(*)::int
  INTO v_conv
  FROM public.leads l
  WHERE l.created_at >= p_start AND l.created_at <= p_end
    AND l.status = ANY(converted_arr);

  v_rate := CASE
    WHEN v_total > 0 THEN round((v_conv::numeric / v_total * 100)::numeric, 2)
    ELSE 0
  END;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', r.assigned_to,
        'user_name', COALESCE(u.name, 'Unknown'),
        'total_leads', r.total,
        'converted_leads', r.conv,
        'conversion_rate', CASE
          WHEN r.total > 0 THEN round((r.conv::numeric / r.total * 100)::numeric, 2)
          ELSE 0
        END
      )
      ORDER BY u.name NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_rep
  FROM (
    SELECT l.assigned_to,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE l.status = ANY(converted_arr))::int AS conv
    FROM public.leads l
    WHERE l.created_at >= p_start AND l.created_at <= p_end
      AND l.assigned_to IS NOT NULL
    GROUP BY l.assigned_to
  ) r
  LEFT JOIN public.users u ON u.id = r.assigned_to;

  SELECT
    CASE
      WHEN COUNT(*) > 0 THEN round(
        (COUNT(*) FILTER (WHERE f.status = 'done')::numeric / COUNT(*)::numeric * 100)::numeric,
        2
      )
      ELSE 0
    END
  INTO v_fu
  FROM public.follow_ups f
  WHERE f.scheduled_at >= p_start AND f.scheduled_at <= p_end;

  SELECT COUNT(*)::int
  INTO v_sla
  FROM public.leads l
  WHERE l.created_at >= p_start AND l.created_at <= p_end
    AND l.status = 'new'
    AND (
      l.first_contact_at IS NULL
      OR EXTRACT(EPOCH FROM (l.first_contact_at - l.created_at)) / 60.0 > 5
    );

  WITH series AS (
    SELECT gs::date AS d
    FROM generate_series(p_start::date, p_end::date, interval '1 day') AS gs
  ),
  daily AS (
    SELECT (l.created_at AT TIME ZONE 'UTC')::date AS d,
      COUNT(*)::int AS leads,
      COUNT(*) FILTER (WHERE l.status = ANY(converted_arr))::int AS converted
    FROM public.leads l
    WHERE l.created_at >= p_start AND l.created_at <= p_end
    GROUP BY 1
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'date', s.d::text,
        'leads', COALESCE(d.leads, 0),
        'converted', COALESCE(d.converted, 0)
      )
      ORDER BY s.d
    ),
    '[]'::jsonb
  )
  INTO v_time
  FROM series s
  LEFT JOIN daily d ON d.d = s.d;

  WITH prod AS (
    SELECT p.id, p.title, lower(trim(p.title)) AS t
    FROM public.products p
    WHERE p.is_active = true
      AND p.title IS NOT NULL
      AND btrim(p.title) <> ''
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_name', x.title,
        'product_id', x.id,
        'leads_count', x.cnt
      )
      ORDER BY x.cnt DESC
    ),
    '[]'::jsonb
  )
  INTO v_int
  FROM (
    SELECT pr.id, pr.title, COUNT(*)::int AS cnt
    FROM prod pr
    INNER JOIN public.leads l ON l.requirement IS NOT NULL
      AND lower(l.requirement) LIKE '%' || pr.t || '%'
      AND l.created_at >= p_start
      AND l.created_at <= p_end
    GROUP BY pr.id, pr.title
    HAVING COUNT(*) > 0
  ) x;

  WITH prod AS (
    SELECT p.id, p.title, lower(trim(p.title)) AS t
    FROM public.products p
    WHERE p.is_active = true
      AND p.title IS NOT NULL
      AND btrim(p.title) <> ''
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_name', x.title,
        'product_id', x.id,
        'leads_count', x.cnt
      )
      ORDER BY x.cnt DESC
    ),
    '[]'::jsonb
  )
  INTO v_cprod
  FROM (
    SELECT pr.id, pr.title, COUNT(*)::int AS cnt
    FROM prod pr
    INNER JOIN public.leads l ON l.requirement IS NOT NULL
      AND lower(l.requirement) LIKE '%' || pr.t || '%'
      AND l.created_at >= p_start
      AND l.created_at <= p_end
      AND l.status = ANY(converted_arr)
    GROUP BY pr.id, pr.title
    HAVING COUNT(*) > 0
  ) x;

  RETURN jsonb_build_object(
    'leadsBySource', v_src,
    'leadsByStatus', v_st,
    'conversionRate', v_rate,
    'repPerformance', v_rep,
    'followUpCompliance', LEAST(100::numeric, GREATEST(0::numeric, v_fu)),
    'slaBreaches', v_sla,
    'leadsOverTime', v_time,
    'leadsInterestedByProduct', v_int,
    'convertedLeadsByProduct', v_cprod
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_lead_counts_by_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_analytics_dashboard(timestamptz, timestamptz) TO service_role;

-- ---------- 037_crm_performance_indexes.sql ----------
-- Branch and list-pattern indexes; WhatsApp message lookup columns.

CREATE INDEX IF NOT EXISTS leads_branch_id_idx ON public.leads(branch_id)
WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_branch_id_idx ON public.users(branch_id)
WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_assigned_created_idx ON public.leads(assigned_to, created_at DESC)
WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_status_created_idx ON public.leads(status, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_messages_meta_message_id_idx ON public.whatsapp_messages(meta_message_id)
WHERE meta_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_messages_status_created_idx ON public.whatsapp_messages(status, created_at DESC)
WHERE status IS NOT NULL;

-- ---------- 038_lead_notes.sql ----------
-- Lead notes table to store user-entered notes related to leads.
CREATE TABLE IF NOT EXISTS public.lead_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_id_idx ON public.lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS lead_notes_created_at_idx ON public.lead_notes(created_at DESC);

CREATE TRIGGER update_lead_notes_updated_at BEFORE UPDATE ON public.lead_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- 039_whatsapp_inbox_extensions.sql ----------
-- Additive inbox extensions for whatsapp_messages (safe, backward-compatible)
-- Supports attachments, conversation grouping, assignment, and unread tracking.

alter table public.whatsapp_messages
  add column if not exists message_type text,
  add column if not exists attachment_url text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_file_name text,
  add column if not exists attachment_size_bytes bigint,
  add column if not exists thumbnail_url text,
  add column if not exists conversation_key text,
  add column if not exists assigned_to uuid references public.users(id) on delete set null,
  add column if not exists is_read boolean,
  add column if not exists read_at timestamptz;

-- Keep values consistent and safe for old rows
update public.whatsapp_messages
set message_type = coalesce(message_type, 'text'),
    conversation_key = coalesce(conversation_key, regexp_replace(phone, '\D', '', 'g')),
    is_read = coalesce(
      is_read,
      case
        when direction = 'out' then true
        when direction = 'in' then false
        else false
      end
    )
where message_type is null
   or conversation_key is null
   or is_read is null;

-- Normalize conversation key whenever present
update public.whatsapp_messages
set conversation_key = regexp_replace(conversation_key, '\D', '', 'g')
where conversation_key is not null
  and conversation_key <> regexp_replace(conversation_key, '\D', '', 'g');

alter table public.whatsapp_messages
  alter column message_type set default 'text',
  alter column is_read set default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_messages_message_type_check'
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_message_type_check
      check (message_type in ('text', 'image', 'video', 'document'));
  end if;
end $$;

create index if not exists idx_whatsapp_messages_conversation_key_created_at
  on public.whatsapp_messages(conversation_key, created_at desc);

create index if not exists idx_whatsapp_messages_meta_message_id
  on public.whatsapp_messages(meta_message_id);

create index if not exists idx_whatsapp_messages_phone_created_at
  on public.whatsapp_messages(phone, created_at desc);

create index if not exists idx_whatsapp_messages_unread
  on public.whatsapp_messages(conversation_key, created_at desc)
  where is_read = false and direction = 'in';

comment on column public.whatsapp_messages.message_type is 'Message payload type: text, image, video, document.';
comment on column public.whatsapp_messages.conversation_key is 'Normalized phone key used to group messages into a conversation.';
comment on column public.whatsapp_messages.assigned_to is 'User currently assigned to handle the conversation.';

-- ---------- 040_whatsapp_messages_realtime_publication.sql ----------
-- Ensure whatsapp_messages emits postgres_changes for Realtime (Sent/Delivered/Read UI sync).
-- Safe to run once; skips if already in publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  END IF;
END $$;

-- ---------- 041_whatsapp_messages_status_check_read.sql ----------
-- Allow delivery status 'read' (and 'failed') on whatsapp_messages.status.
-- Some DBs had a check constraint listing only sent/delivered, which caused
-- updateMessageStatus(..., 'read') to fail with 23514.

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_status_check;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_status_check
  check (
    status is null
    or status in ('sent', 'delivered', 'read', 'failed')
  );

comment on constraint whatsapp_messages_status_check on public.whatsapp_messages is
  'Outgoing delivery status from Meta webhooks: sent, delivered, read, failed. Null for incoming.';

-- ---------- 042_whatsapp_messages_updated_at_and_revision.sql ----------
-- Track row changes for inbox ETag / conditional GET; any INSERT or UPDATE bumps updated_at.

alter table public.whatsapp_messages
  add column if not exists updated_at timestamptz default now();

update public.whatsapp_messages
set updated_at = coalesce(created_at, now())
where updated_at is null;

create or replace function public.whatsapp_messages_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists whatsapp_messages_set_updated_at on public.whatsapp_messages;
create trigger whatsapp_messages_set_updated_at
  before update on public.whatsapp_messages
  for each row
  execute procedure public.whatsapp_messages_set_updated_at();

comment on column public.whatsapp_messages.updated_at is 'Bumped on every update; used for inbox list ETag / conditional requests.';

-- Single cheap fingerprint for If-None-Match (avoids full conversation list when unchanged).
create or replace function public.whatsapp_inbox_revision()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(
    coalesce(
      (select max(coalesce(updated_at, created_at))::text from public.whatsapp_messages),
      ''
    )
    || '|' ||
    (select count(*)::text from public.whatsapp_messages)
    || '|' ||
    (select count(*)::text from public.whatsapp_messages where direction = 'in' and coalesce(is_read, false) = false)
  );
$$;

grant execute on function public.whatsapp_inbox_revision() to service_role;
grant execute on function public.whatsapp_inbox_revision() to authenticated;

-- ---------- 043_whatsapp_thread_revision.sql ----------
-- Fingerprint for GET /chat (messages) If-None-Match — matches conversation thread filters.

create or replace function public.whatsapp_thread_revision(
  p_conversation_key text default null,
  p_lead_id uuid default null,
  p_phone text default null
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with thread as (
    select m.*
    from public.whatsapp_messages m
    where
      case
        when p_conversation_key is not null then
          m.conversation_key = p_conversation_key
        when p_lead_id is not null or p_phone is not null then
          (p_lead_id is not null and m.lead_id = p_lead_id)
          or (p_phone is not null and m.phone = p_phone)
        else
          false
      end
  )
  select md5(
    coalesce((select max(coalesce(updated_at, created_at))::text from thread), '') ||
    '|' ||
    (select count(*)::text from thread) ||
    '|' ||
    (select count(*)::text from thread where direction = 'in' and coalesce(is_read, false) = false)
  );
$$;

grant execute on function public.whatsapp_thread_revision(text, uuid, text) to service_role;
grant execute on function public.whatsapp_thread_revision(text, uuid, text) to authenticated;

-- ---------- 044_whatsapp_messages_reply_to.sql ----------
-- Store WhatsApp contextual reply (quoted message) by parent wamid for inbox UI.
alter table public.whatsapp_messages
  add column if not exists reply_to_meta_message_id text;

comment on column public.whatsapp_messages.reply_to_meta_message_id is
  'Meta message id (wamid) of the message this row replies to; maps to Cloud API context.message_id.';

create index if not exists idx_whatsapp_messages_reply_to_meta
  on public.whatsapp_messages (reply_to_meta_message_id)
  where reply_to_meta_message_id is not null;

-- ---------- 045_whatsapp_messages_reply_context_from.sql ----------
-- Sender phone/id of the quoted message (Meta `context.from`) — used when parent row is missing or for label when wamids differ.
alter table public.whatsapp_messages
  add column if not exists reply_context_from text;

comment on column public.whatsapp_messages.reply_context_from is
  'Meta context.from for replies: who sent the quoted message (digits). Helps CRM match WhatsApp quote UI when parent wamid lookup differs.';
