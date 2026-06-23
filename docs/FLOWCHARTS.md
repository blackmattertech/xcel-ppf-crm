# Flowcharts — Lead buckets

```mermaid
flowchart TD
  Admin[Admin] --> BucketsPage[/buckets page]
  BucketsPage --> CreateAPI[POST /api/buckets]
  CreateAPI --> DB[(lead_buckets)]

  Caller[Tele-caller / Admin] --> LeadDetail[Lead detail Interests]
  LeadDetail --> Picker[LeadBucketPicker]
  Picker --> TagAPI[PUT /api/leads/id/buckets]
  TagAPI --> AssignDB[(lead_bucket_assignments)]
  AssignDB --> Leads[(leads)]

  BucketsPage --> DetailAPI[GET /api/buckets/id?include=leads]
  DetailAPI --> AssignDB
```

```mermaid
sequenceDiagram
  participant U as User
  participant UI as LeadBucketPicker
  participant API as /api/leads/id/buckets
  participant S as bucket.service
  participant DB as Postgres

  U->>UI: Toggle bucket chip
  UI->>API: PUT bucketIds
  API->>S: setLeadBuckets
  S->>DB: Verify lead access
  S->>DB: DELETE old assignments
  S->>DB: INSERT new assignments
  S-->>API: Updated buckets
  API-->>UI: 200 OK
```

---

# Flowcharts — WhatsApp automation

```mermaid
flowchart TD
  Admin[Admin] --> FlowUI[/marketing/whatsapp/automation]
  FlowUI --> FlowAPI[POST /api/automation/whatsapp/flows]
  FlowAPI --> FlowDB[(whatsapp_automation_flows)]

  Caller[Caller] --> EnrollAPI[POST enrollments or bucket-links]
  EnrollAPI --> EnrollDB[(lead_enrollments)]

  FastCron[FastCron 15m] --> CronRoute[/api/cron/whatsapp-automation]
  CronRoute --> Job[whatsapp-automation.job]
  Job --> BatchDB[(trigger_batches)]
  Job --> Meta[Meta WhatsApp API]
```

```mermaid
sequenceDiagram
  participant Cron
  participant Batch as trigger_batches
  participant Meta

  Cron->>Batch: claim pending batch
  loop chunks until time budget
    Cron->>Meta: send template or media
    Cron->>Batch: update remainingRecipients
  end
  alt queue not empty
    Cron->>Batch: status pending for next tick
  else done
    Cron->>Batch: status completed
  end
```

---

# Flowcharts — MCube failed-call WhatsApp

```mermaid
flowchart TD
  Admin[Admin] --> Settings[Settings MCUBE Call Rules]
  Settings --> PutAPI[PUT /api/integrations/mcube/settings]
  PutAPI --> McubeSettings[(mcube_settings)]

  Caller[Tele-caller] --> Outbound[POST /api/integrations/mcube/outbound]
  Outbound --> McubeAPI[MCube outbound API]
  McubeAPI --> Webhook[POST /api/webhooks/mcube hangup]
  Webhook --> Hangup[handleHangup]
  Hangup --> Check{outbound + not_reachable?}
  Check -->|no| Done[Skip WhatsApp]
  Check -->|yes| Svc[maybeSendFailedCallWhatsAppTemplate]
  Svc --> McubeSettings
  Svc --> Log[(mcube_failed_call_whatsapp_log)]
  Svc --> Meta[Meta WhatsApp template API]
  Meta --> Chat[(whatsapp chat history)]
```

```mermaid
sequenceDiagram
  participant MC as MCube
  participant WH as /api/webhooks/mcube
  participant S as mcube-failed-call-whatsapp
  participant WA as WhatsApp API
  participant DB as Postgres

  MC->>WH: hangup dialstatus NOANSWER
  WH->>DB: INSERT calls outcome not_reachable
  WH->>S: maybeSendFailedCallWhatsAppTemplate
  S->>DB: check mcube_failed_call_whatsapp_log
  S->>DB: load mcube_settings + lead
  S->>WA: sendTemplateMessage
  WA-->>S: messageId
  S->>DB: INSERT log status sent
```
