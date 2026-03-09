# Xcel CRM System

A comprehensive Customer Relationship Management system with role-based access control, lead management, and analytics.

## Features

- **Role-Based Access Control**: Super Admin, Admin, Marketing, Tele-callers with custom role creation
- **Lead Management**: Multiple sources (Meta, manual import, forms) with round-robin assignment
- **Lead Journey Tracking**: Complete workflow from new lead to converted customer
- **Follow-up Engine**: Automated reminders and escalation
- **Quotation System**: Generate and track quotations with GST calculation
- **Customer & Order Management**: Convert leads to customers and manage orders
- **Analytics Dashboard**: Comprehensive metrics and reporting

## Tech Stack

- **Frontend**: Next.js 14+ (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, TypeScript
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

3. Run database migrations:
   - Go to your Supabase dashboard
   - Navigate to SQL Editor
   - Run the migration files in order from `database/migrations/`

4. Create initial super admin:
   - Use Supabase dashboard or create a script to call `createInitialSuperAdmin` function

5. Run the development server:
```bash
npm run dev
```

## Project Structure

```
xcel/
├── app/                    # Next.js app router pages
│   ├── api/               # API routes
│   ├── dashboard/         # Dashboard page
│   ├── leads/             # Lead management pages
│   └── login/             # Login page
├── backend/               # Backend services and middleware
│   ├── middleware/       # Auth middleware
│   └── services/         # Business logic services
├── database/              # Database migrations
│   └── migrations/       # SQL migration files
├── lib/                   # Utilities
│   └── supabase/         # Supabase client configuration
├── shared/                # Shared types and constants
│   ├── constants/        # Application constants
│   └── types/            # TypeScript types
└── components/            # React components
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Roles & Permissions
- `GET /api/roles` - Get all roles
- `POST /api/roles` - Create role
- `GET /api/roles/[id]` - Get role by ID
- `PUT /api/roles/[id]` - Update role
- `DELETE /api/roles/[id]` - Delete role
- `GET /api/permissions` - Get all permissions

### Users
- `GET /api/users` - Get all users
- `POST /api/users` - Create user
- `GET /api/users/[id]` - Get user by ID
- `PUT /api/users/[id]` - Update user
- `DELETE /api/users/[id]` - Delete user

### Leads
- `GET /api/leads` - Get all leads (with filters)
- `POST /api/leads` - Create lead
- `GET /api/leads/[id]` - Get lead by ID
- `PUT /api/leads/[id]` - Update lead
- `DELETE /api/leads/[id]` - Delete lead
- `PUT /api/leads/[id]/status` - Update lead status
- `POST /api/leads/[id]/convert` - Convert lead to customer

### Webhooks
- `POST /api/webhooks/meta` - Meta Lead Ads webhook

### Calls
- `GET /api/calls` - Get calls (with filters)
- `POST /api/calls` - Log a call

### Follow-ups
- `GET /api/followups` - Get follow-ups (with filters)
- `POST /api/followups` - Create follow-up
- `PUT /api/followups/[id]` - Update follow-up
- `POST /api/followups/[id]` - Complete follow-up

### Quotations
- `GET /api/quotations` - Get quotations (with filters)
- `POST /api/quotations` - Create quotation
- `GET /api/quotations/[id]` - Get quotation by ID
- `PATCH /api/quotations/[id]` - Update quotation status

### Customers
- `GET /api/customers` - Get all customers
- `POST /api/customers` - Create customer

### Analytics
- `GET /api/analytics` - Get dashboard analytics

## Database Schema

See `database/migrations/` for complete schema. Key tables:
- `users` - User accounts
- `roles` - User roles
- `permissions` - System permissions
- `role_permissions` - Role-permission mapping
- `leads` - Lead records
- `lead_status_history` - Lead status change history
- `calls` - Call logs
- `follow_ups` - Follow-up schedules
- `quotations` - Quotations
- `customers` - Customer records
- `orders` - Order records
- `assignments` - Round-robin assignment tracking

## Meta Webhook Setup

1. Configure webhook URL in Meta Lead Ads: `https://yourdomain.com/api/webhooks/meta`
2. Set webhook verify token in environment variables
3. Webhook will automatically parse leads and assign them via round-robin

## WhatsApp Template Management

Template creation, validation, submission, and status tracking for the Meta WhatsApp Business Platform.

### Configuration

- **WABA ID & token**: Configure in Settings → Integrations (WhatsApp), or set in `.env.local`:
  - `WHATSAPP_BUSINESS_ACCOUNT_ID` – WhatsApp Business Account ID (required for templates)
  - `WHATSAPP_ACCESS_TOKEN` – Meta access token with `whatsapp_business_management` and `whatsapp_business_messaging`
- **Webhook verification**: `META_WEBHOOK_VERIFY_TOKEN` or `WHATSAPP_WEBHOOK_VERIFY_TOKEN` for GET verification

### Running locally

1. Run `npm run dev` and open Marketing → Message templates.
2. Use "Create template" for the full flow (category, subtype, name, language, content, submit).
3. Templates are submitted to Meta for review; only **APPROVED** templates are sendable.

### Testing in sandbox

Use a Meta test WABA; new templates typically return `PENDING` until reviewed. Sync status via "Sync status from Meta" or the cron endpoint.

### Webhook subscriptions

Subscribe to **message_templates** (or template status updates) in Meta App Dashboard → Webhooks so template approval/rejection and category updates are ingested. Template events are processed by `POST /api/webhooks/whatsapp` and update local template status and history.

### Template sync cron

Optional: call `GET` or `POST /api/cron/whatsapp-template-sync` (e.g. with `Authorization: Bearer <CRON_SECRET>`) to poll Meta and reconcile template status. Set `CRON_SECRET` in env to protect the route.

## License

Private - All rights reserved
