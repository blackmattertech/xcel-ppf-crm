# Industry-Grade Lead Management Features Guide

This document explains all the new features that have been implemented and how to access them.

## 🎯 Quick Access Guide

### **1. Lead Insights & Analytics**
- **Location**: Lead Detail Page → Click "View Insights" button
- **URL**: `/leads/[id]/insights`
- **Features**:
  - Win Probability Score (0-100%)
  - Churn Risk Assessment
  - Best Time to Contact Prediction
  - Lead Score Breakdown (Demographic, Engagement, Fit, Source)

### **2. Activity Timeline**
- **Location**: Lead Detail Page → Click "View All Activities" button
- **URL**: `/leads/[id]/activities`
- **Features**:
  - Complete activity history (calls, emails, SMS, status changes)
  - Activity filtering by type
  - Activity summary statistics

### **3. SLA Management**
- **Location**: Sidebar → "SLA Management"
- **URL**: `/sla`
- **Features**:
  - View active SLA violations
  - Resolve violations
  - Configure SLA rules
  - Automatic escalation tracking

### **4. Advanced Analytics**
- **Location**: Sidebar → "Analytics"
- **URL**: `/analytics`
- **Features**:
  - Pipeline Velocity Metrics
  - Source ROI Analysis
  - Cohort Analysis
  - Rep Performance Metrics
  - Conversion Funnel Visualization

### **5. Nurture Campaigns**
- **Location**: Sidebar → "Nurture Campaigns"
- **URL**: `/nurture`
- **Features**:
  - View all nurture campaigns
  - Create drip campaigns
  - Trigger-based automation
  - Campaign enrollment tracking

## 📊 Features on Lead Detail Page

When viewing a lead (`/leads/[id]`), you'll now see:

1. **Lead Score Badge**: Shows the calculated lead score (0-100) with color coding:
   - Green (80+): High quality
   - Yellow (60-79): Medium quality
   - Gray (<60): Low quality

2. **SLA Violation Alert**: If the lead has an active SLA violation, a red warning badge appears

3. **Intelligence Section**: Quick view of:
   - Current lead score
   - SLA status
   - Links to detailed insights

4. **Activity Timeline Link**: Quick access to full activity history

## 🔍 How to Use Each Feature

### **Checking Lead Score**
1. Open any lead detail page
2. Look for the "Score: XX" badge in the status tags
3. Click "View Insights" for detailed breakdown

### **Viewing SLA Violations**
1. Go to `/sla` from sidebar
2. See all active violations
3. Click "Resolve" to mark as resolved
4. Click "Check SLA" to run a fresh check

### **Analyzing Pipeline Performance**
1. Go to `/analytics` from sidebar
2. Click "Pipeline" tab
3. See average time in each stage
4. Identify bottlenecks

### **Finding Duplicate Leads**
1. When creating a lead, duplicates are automatically detected
2. Use `/api/leads/duplicates` API to find duplicates manually
3. Use `/api/leads/merge` to merge duplicate leads

### **Enriching Lead Data**
1. Open lead detail page
2. Use `/api/leads/[id]/enrich` endpoint (or add button in UI)
3. Data is automatically validated and normalized on creation

### **Setting Up Nurture Campaigns**
1. Go to `/nurture` from sidebar
2. Click "New Campaign"
3. Configure steps (email, SMS, delays, actions)
4. Set trigger conditions
5. Campaigns run automatically via background jobs

### **Viewing Predictive Insights**
1. Open lead detail page
2. Click "View Insights"
3. See win probability, churn risk, and best contact time

## 🔄 Background Jobs

These need to be set up as cron jobs or scheduled tasks:

1. **SLA Check**: `/api/sla/check` (POST) - Run every 5 minutes
2. **Nurture Processing**: `/api/nurture/process` (POST) - Run every 15 minutes
3. **Lead Recycling**: `/api/recycle/process` (POST) - Run daily
4. **Score Decay**: Call `applyScoreDecay()` function - Run daily

## 📱 API Endpoints Summary

### SLA Management
- `GET /api/sla/violations` - Get active violations
- `POST /api/sla/violations` - Resolve violation
- `GET /api/sla/rules` - Get SLA rules
- `POST /api/sla/rules` - Create/update rule
- `POST /api/sla/check` - Check for new violations

### Lead Scoring
- `GET /api/leads/[id]/score` - Get lead score
- `POST /api/leads/[id]/score` - Recalculate score

### Duplicate Detection
- `POST /api/leads/duplicates` - Find duplicates
- `GET /api/leads/duplicates` - Get all duplicate pairs
- `POST /api/leads/merge` - Merge duplicates

### Activities
- `GET /api/leads/[id]/activities` - Get activities
- `POST /api/leads/[id]/activities` - Create activity
- `GET /api/leads/[id]/activities?summary=true` - Get summary

### Predictive Analytics
- `GET /api/leads/[id]/predictive` - Get insights
- `GET /api/leads/at-risk` - Get at-risk leads

### Advanced Analytics
- `GET /api/analytics/advanced?metric=pipeline` - Pipeline metrics
- `GET /api/analytics/advanced?metric=source_roi` - Source ROI
- `GET /api/analytics/advanced?metric=cohort` - Cohort analysis
- `GET /api/analytics/advanced?metric=rep_performance` - Rep performance
- `GET /api/analytics/advanced?metric=funnel` - Conversion funnel
- `GET /api/analytics/advanced?metric=all` - All metrics

### Nurture Campaigns
- `GET /api/nurture/campaigns` - Get campaigns
- `POST /api/nurture/campaigns` - Create campaign
- `POST /api/nurture/process` - Process pending steps
- `POST /api/leads/[id]/enroll` - Enroll lead in campaign

### Lead Recycling
- `POST /api/leads/[id]/recycle` - Recycle a lead
- `GET /api/recycle/rules` - Get recycle rules
- `POST /api/recycle/rules` - Create/update rule
- `POST /api/recycle/process` - Process automatic recycling

### Integrations
- `POST /api/integrations/email/send` - Send email
- `POST /api/integrations/sms/send` - Send SMS
- `POST /api/integrations/whatsapp/send` - Send WhatsApp
- `POST /api/leads/[id]/enrich` - Enrich lead data

## 🎨 UI Components Added

1. **Lead Score Badge** - Shows on lead cards and detail page
2. **SLA Violation Alert** - Red warning badge on leads with violations
3. **Activity Timeline** - Full activity history view
4. **Insights Dashboard** - Predictive analytics visualization
5. **Analytics Dashboard** - Multiple analytics views with tabs

## 🚀 Next Steps

1. **Run Database Migrations**: Execute migrations 012-017 in order
2. **Set Up Background Jobs**: Configure cron jobs for automated processing
3. **Configure External APIs**: Add API keys for email/SMS/WhatsApp when ready
4. **Customize Scoring Weights**: Adjust scoring factors in `scoring.service.ts`
5. **Set Up SLA Rules**: Configure SLA rules based on your business needs
6. **Create Nurture Campaigns**: Set up automated drip campaigns

## 📝 Notes

- All features are fully functional but some integrations (email/SMS) are stubbed until API keys are added
- Lead scores are calculated automatically on lead creation and activity
- SLA violations are checked automatically but can be manually triggered
- Activity timeline is automatically populated from existing systems (calls, status changes, etc.)
