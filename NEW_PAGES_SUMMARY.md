# New Pages & Features Summary

All new pages and features have been created. Here's how to access them:

## 📄 New Pages Created

### 1. **Lead Insights Page** (`/leads/[id]/insights`)
- **Access**: Click "View Insights" button on lead detail page
- **Features**:
  - Win Probability Score with factors
  - Churn Risk Assessment
  - Best Time to Contact prediction
  - Lead Score Breakdown (Demographic, Engagement, Fit, Source)

### 2. **Lead Activities Page** (`/leads/[id]/activities`)
- **Access**: Click "View All Activities" button on lead detail page
- **Features**:
  - Complete activity timeline
  - Filter by activity type
  - Activity summary statistics
  - All calls, emails, SMS, status changes, etc.

### 3. **SLA Management Page** (`/sla`)
- **Access**: Sidebar → "SLA Management"
- **Features**:
  - View all active SLA violations
  - Resolve violations
  - View and manage SLA rules
  - Manual SLA check trigger

### 4. **Advanced Analytics Page** (`/analytics`)
- **Access**: Sidebar → "Analytics"
- **Features**:
  - **Pipeline Tab**: Stage velocity, conversion rates, drop-off analysis
  - **Source ROI Tab**: Revenue per source, conversion rates, ROI calculations
  - **Cohort Tab**: Monthly/weekly cohort analysis
  - **Rep Performance Tab**: Individual rep metrics and leaderboards
  - **Funnel Tab**: Conversion funnel visualization

### 5. **Nurture Campaigns Page** (`/nurture`)
- **Access**: Sidebar → "Nurture Campaigns"
- **Features**:
  - View all nurture campaigns
  - Create new campaigns
  - View campaign details and steps
  - Manage campaign enrollment

## 🔄 Enhanced Existing Pages

### **Lead Detail Page** (`/leads/[id]`)
**New Features Added**:
- Lead Score badge in status tags
- SLA Violation warning badge
- Intelligence section showing score and SLA status
- Quick links to Activities and Insights pages
- Score display in the header

### **Leads List Page** (`/leads`)
**New Features Added**:
- Lead Score column in table view (sortable)
- Lead Score badge in grid/kanban views
- SLA violation indicator badges
- Score-based color coding (Green/Yellow/Gray)

## 🎯 Quick Access Guide

### To View Lead Score:
1. **In List View**: Look for "Score" column in table
2. **In Grid/Kanban**: Look for "Score: XX" badge on cards
3. **In Detail View**: See score badge in header, click "View Insights" for breakdown

### To View SLA Violations:
1. Go to `/sla` from sidebar
2. See all active violations
3. Click "Resolve" to mark as resolved
4. Click "Check SLA" to run fresh check

### To View Analytics:
1. Go to `/analytics` from sidebar
2. Switch between tabs (Pipeline, Source ROI, Cohort, Reps, Funnel)
3. All data is real-time from your database

### To View Activities:
1. Open any lead
2. Click "View All Activities" button
3. Filter by type or view all
4. See complete timeline of all interactions

### To View Predictive Insights:
1. Open any lead
2. Click "View Insights" button
3. See win probability, churn risk, and best contact time

## 📊 Data Display

### Lead Score Colors:
- **Green (80-100)**: High quality lead
- **Yellow (60-79)**: Medium quality lead
- **Gray (<60)**: Low quality lead

### SLA Violation Indicators:
- **Red Badge**: Active SLA violation
- Shows violation type and minutes overdue
- Click to view details in SLA page

## 🔗 Navigation

All new pages are accessible via:
1. **Sidebar Menu** (for main pages)
2. **Lead Detail Page Buttons** (for lead-specific pages)
3. **Direct URLs** (as listed above)

## 📝 Notes

- Lead scores are calculated automatically
- SLA violations are checked via background jobs
- Activities are logged automatically from existing systems
- All analytics are calculated in real-time from your data
