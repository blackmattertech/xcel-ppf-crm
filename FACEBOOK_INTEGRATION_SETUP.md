# Facebook Business Integration Setup Guide

This guide will help you set up the Facebook Business integration for your CRM system.

## Prerequisites

1. A Facebook Business account
2. A Facebook App with Business Management API access
3. Admin access to your CRM system

## Step 1: Create a Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **"My Apps"** → **"Create App"**
3. Select **"Business"** as the app type
4. Fill in your app details:
   - **App Name**: Your CRM name (e.g., "Xcel CRM")
   - **App Contact Email**: Your email address
5. Click **"Create App"**

## Step 2: Configure Facebook App Settings

### Add Facebook Login Product

1. In your app dashboard, go to **"Add Products"**
2. Find **"Facebook Login"** and click **"Set Up"**
3. Go to **Settings** → **Basic**
4. Add **Valid OAuth Redirect URIs**:
   ```
   https://yourdomain.com/api/integrations/facebook/callback
   http://localhost:3000/api/integrations/facebook/callback (for development)
   ```

### Request Required Permissions

1. Go to **App Review** → **Permissions and Features**
2. Request the following permissions:
   - `pages_read_engagement` - Read page engagement data
   - `pages_manage_metadata` - Manage page metadata
   - `pages_read_user_content` - Read user content on pages
   - `business_management` - Manage business assets
   - `ads_read` - Read ads data
   - `ads_management` - Manage ads

**Note**: Some permissions may require App Review from Facebook. For development, you can use your own account without review.

## Step 3: Get Your App Credentials

1. In your app dashboard, go to **Settings** → **Basic**
2. Copy the following:
   - **App ID**
   - **App Secret** (click "Show" to reveal)

## Step 4: Configure Environment Variables

Add the following to your `.env.local` file:

```env
FACEBOOK_APP_ID=your_app_id_here
FACEBOOK_APP_SECRET=your_app_secret_here
```

**Important**: Never commit these values to version control. Keep them secure.

## Step 5: Run Database Migration

Run the database migration to create the Facebook Business settings table:

1. Go to your Supabase dashboard
2. Navigate to **SQL Editor**
3. Run the migration file: `database/migrations/010_facebook_business_integration.sql`

Or use the Supabase CLI:

```bash
supabase db push
```

## Step 6: Connect Your Facebook Business Account

1. Log in to your CRM system
2. Navigate to **Settings** → **Integrations**
3. Click **"Connect Facebook Business Account"**
4. You'll be redirected to Facebook to authorize the app
5. Grant the requested permissions
6. You'll be redirected back to the CRM with your account connected

## Features

Once connected, the integration provides:

- **Meta Ads Management**: Access your Meta (Facebook) ad accounts and campaigns
- **Ad Performance Analytics**: View impressions, clicks, spend, CTR, CPC, leads, and more
- **Campaign Insights**: Monitor active campaigns, adsets, and ads
- **Facebook Page Access**: View and manage your connected Facebook pages
- **Business Management**: Manage your Facebook Business assets
- **Lead Syncing**: Leads from Facebook Lead Ads are automatically synced via webhook (existing feature)

### Meta Ads Marketing Features

The integration enables you to:
- **View Ad Performance**: Get real-time insights on your Meta Ads campaigns
- **Track Lead Generation**: See how many leads your ads are generating
- **Monitor Campaign Health**: Track active campaigns, adsets, and individual ads
- **Analyze ROI**: View spend, clicks, impressions, and conversion metrics
- **API Access**: Use the stored access token to build custom marketing dashboards

## Troubleshooting

### "Facebook App ID and Secret must be configured"

- Ensure `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are set in your `.env.local` file
- Restart your development server after adding environment variables

### "Popup blocked" error

- Allow popups for your domain in your browser settings
- Try using a different browser

### "Token exchange failed"

- Check that your OAuth redirect URI matches exactly in Facebook App settings
- Ensure your app is not in Development mode restrictions (or add test users)

### Connection expires

- Facebook access tokens expire after 60 days
- You'll see a warning when your token is about to expire
- Click "Reconnect" to refresh your connection

## Security Notes

- Access tokens are stored encrypted in the database
- Only authenticated users can connect their Facebook accounts
- Each user's connection is isolated (users can only see their own connections)
- Disconnecting removes access but preserves connection history

## API Endpoints

- `GET /api/integrations/facebook/connect` - Initiate OAuth flow
- `GET /api/integrations/facebook/callback` - Handle OAuth callback
- `GET /api/integrations/facebook/config` - Get connection status
- `DELETE /api/integrations/facebook/config` - Disconnect account

## Next Steps

After connecting, you can:

1. View your connected Facebook pages and ad accounts in Settings
2. Monitor lead syncing from Facebook Lead Ads (via existing webhook)
3. Extend the integration to fetch ad performance data, manage campaigns, etc.

## Support

For issues or questions:
- Check Facebook Developer Documentation: https://developers.facebook.com/docs/
- Review Facebook Business API: https://developers.facebook.com/docs/marketing-apis
