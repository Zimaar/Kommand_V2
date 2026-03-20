# Shopify App Store — Listing & Review Checklist

## App Listing

### Name
Kommand — AI Business Agent

### Tagline (80 chars max)
AI agent that runs your business through WhatsApp. Ask anything. Get answers.

### Short description (100 words)
Kommand is an autonomous AI agent that manages your Shopify store through WhatsApp. Text it like you'd text a COO — it reasons about your business, pulls real data, runs analysis, generates reports, and takes action. No dashboards, no menus, no commands to memorise. Ask open-ended questions ("Compare last 6 months to last year and send me a PDF"), and the agent figures out the rest. Connects to Xero for accounting. Generates charts, spreadsheets, and PDF reports on the fly. Proactively alerts you when something needs attention.

### Full description

**Your business, as a conversation.**

Kommand isn't a chatbot — it's an autonomous AI agent with 7 primitives that compose into thousands of capabilities at runtime.

**What it does:**
- 📊 **Instant analysis** — "What are my top 5 products by margin this quarter?" → Real numbers from your actual data in seconds
- 📄 **Generated reports** — "Compare last 6 months and give me a PDF" → Full report with charts, delivered to your WhatsApp
- 💰 **Accounting** — Connects to Xero for invoices, P&L, aged receivables, and cross-platform insights
- 🛒 **Store operations** — Create discounts, check inventory, process refunds, manage fulfilments — all via text
- 🐍 **Data science** — The agent writes and runs Python (pandas, matplotlib) for analysis no dashboard can do
- ⚡ **Proactive alerts** — "Your return rate jumped to 8% this week. All returns are the Black Sweater, size L."
- 🧠 **Business memory** — Learns your patterns, supplier contacts, seasonal trends — gets smarter over time

**How it works:**
1. Connect your Shopify store (OAuth — takes 30 seconds)
2. Link your WhatsApp number
3. Text anything you'd ask a business analyst, operations manager, or accountant
4. The agent reasons, pulls data, runs analysis, and delivers

**Security:**
- OAuth tokens encrypted with AES-256-GCM at rest
- All webhooks verified via HMAC-SHA256 with timing-safe comparison
- AI code execution runs in isolated, disposable sandboxes with no access to your credentials
- Tenant-isolated database — your data is never mixed with another store's
- GDPR compliant with full data export and deletion

**Plans:**
- Starter: $29/mo — 1 store, 500 agent runs
- Growth: $59/mo — 2 stores, 2,000 runs, Xero, proactive analysis
- Pro: $149/mo — Unlimited stores & runs, priority, 3 team seats
- 14-day free trial on all plans, no credit card required

### Key benefits (bullet points for listing)
- Ask open-ended business questions in WhatsApp and get real answers from your actual data
- Generate PDF reports, spreadsheets, and charts — delivered straight to your phone
- Connect Xero for accounting insights alongside Shopify data
- Proactive alerts surface problems before you notice them
- The agent learns your business over time and gets smarter

### App category
Store management

### Screenshots needed
1. **WhatsApp conversation** — owner asking "Compare last 6 months" → agent delivering analysis + PDF
2. **Dashboard onboarding** — connecting Shopify store (clean OAuth flow)
3. **Proactive alert** — agent surfacing a return rate spike unprompted
4. **File delivery** — agent sending a generated PDF report in WhatsApp
5. **Xero integration** — agent pulling P&L data and cross-referencing with Shopify orders

### Demo video script (60 seconds)
```
[0-5s]  "Meet Kommand — an AI agent that runs your Shopify store through WhatsApp."
[5-15s] Show: owner texting "What are my top products this month?"
        → agent responds with real data in 3 seconds
[15-25s] "It doesn't just answer questions — it takes action."
         Show: "Give 20% off to customers who spent over $500 this year"
         → agent finds 47 customers, creates discount, asks to confirm
[25-40s] "Need a report? Just ask."
         Show: "Compare last 6 months to same period last year. PDF."
         → agent pulls data, runs Python analysis, generates PDF, sends to WhatsApp
[40-50s] "It even tells you things you didn't ask."
         Show: proactive alert about return rate spike
[50-60s] "Your business, as a conversation. Start free at kommand.dev."
```

---

## Privacy & Legal URLs

| Requirement | URL |
|-------------|-----|
| Privacy policy | https://kommand.dev/privacy |
| Terms of service | https://kommand.dev/terms |

---

## GDPR Webhook Endpoints

All three mandatory Shopify GDPR webhooks are implemented and return 200:

| Topic | Endpoint | Status |
|-------|----------|--------|
| `customers/data_request` | POST /webhooks/shopify | ✅ Implemented (logs + processes) |
| `customers/redact` | POST /webhooks/shopify | ✅ Implemented (logs + processes) |
| `shop/redact` | POST /webhooks/shopify | ✅ Implemented (logs + processes) |

All webhooks use HMAC-SHA256 signature verification before processing.

---

## App Review Checklist

### OAuth flow
- [x] Shopify OAuth install URL generated with state nonce (CSRF protection)
- [x] State nonce stored in Redis with 5-minute TTL
- [x] HMAC signature verified on callback (timingSafeEqual)
- [x] Nonce consumed on use (single-use)
- [x] Access token encrypted with AES-256-GCM before storage
- [x] Redirect to dashboard after successful install
- [x] Shop domain validated: `^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$`

### Webhook verification
- [x] WhatsApp: HMAC-SHA256 with app secret, timingSafeEqual
- [x] Shopify: HMAC-SHA256 with API secret (base64), timingSafeEqual
- [x] Raw body preserved for signature verification (fastify-raw-body)
- [x] Invalid signatures rejected with 401 before any processing

### Billing
- [ ] Shopify Billing API integration (recurring charge creation)
- [ ] Plan enforcement (agent run limits per plan tier)
- [ ] Trial period handling (14 days, no credit card)
- [ ] Upgrade/downgrade flow in dashboard

### Uninstall handling
- [x] `app/uninstalled` webhook registered and handled
- [x] Store deactivated on uninstall (isActive = false)
- [x] Owner notified via WhatsApp about disconnection

### Data handling
- [x] No bulk data storage — real-time API access only
- [x] OAuth tokens encrypted at rest (AES-256-GCM)
- [x] Tenant isolation on all database queries
- [x] Generated files auto-expire after 24 hours
- [x] Privacy policy page at /privacy
- [x] Terms of service page at /terms

### Security
- [x] Helmet security headers
- [x] CORS restricted to dashboard domain
- [x] 1 MB request body limit
- [x] Rate limiting configured (Redis sliding window)
- [x] Agent output sanitised before sending to WhatsApp
- [x] Prompt injection defence in system prompt
- [x] Code sandbox isolated (E2B, no credentials)

### Required scopes
```
read_orders, write_orders, read_products, write_products,
read_inventory, write_inventory, read_customers, read_analytics,
read_discounts, write_discounts
```

### Before submission
- [ ] All checklist items above marked complete
- [ ] Screenshots captured (5 required)
- [ ] Demo video recorded (60 seconds)
- [ ] App tested on a real Shopify development store end-to-end
- [ ] Billing flow tested with Shopify test charges
- [ ] Privacy policy reviewed by legal counsel
- [ ] Terms of service reviewed by legal counsel
