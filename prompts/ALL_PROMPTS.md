# BUILD GUIDE — 34 Prompts

Load PROJECT_BIBLE.md as context for every session.
Execute prompts in order within each milestone.
Test after each. Commit after each.

---

## M0: SCAFFOLD (4 prompts, half day)

### 0.1 — Monorepo + TypeScript

```
Create a TypeScript monorepo:

Root:
- package.json with workspaces: ["apps/*", "packages/*"]
- tsconfig.json: strict, ESNext target, NodeNext module resolution
- turbo.json: build, dev, lint, test pipelines
- .gitignore: node_modules, dist, .env, .turbo
- .env.example: copy all vars from PROJECT_BIBLE.md

Workspaces:

packages/shared/
- package.json: @kommand/shared, deps: zod
- src/types.ts: export all types:
    TenantId = string & { __brand: "TenantId" }
    InboundMessage = { tenantId: string, channelType: "whatsapp"|"slack"|"email", text: string, channelMsgId: string, timestamp: Date, metadata?: Record<string,unknown> }
    OutboundMessage = { tenantId: string, text: string, buttons?: {id:string,title:string}[], fileUrl?: string }
    PrimitiveResult = { success: boolean, data?: unknown, error?: string, files?: {url:string,filename:string,contentType:string}[] }
    AgentRun = { id: string, tenantId: string, trigger: "message"|"morning_brief"|"proactive"|"scheduled", input: string, output?: string, iterations: number, primitiveCalls: PrimitiveCall[], tokensInput: number, tokensOutput: number, latencyMs: number, status: "running"|"completed"|"failed"|"timeout" }
    PrimitiveCall = { name: string, input: unknown, result: PrimitiveResult, latencyMs: number }
    PendingAction = { id: string, tenantId: string, actionType: string, primitiveName: string, primitiveInput: unknown, previewText: string, expiresAt: Date }
- src/schemas.ts: Zod schemas for all types + env validation (parseEnv function)
- src/index.ts: barrel export

apps/api/
- package.json: deps: fastify, @fastify/cors, @fastify/sensible, dotenv, drizzle-orm, postgres
- tsconfig.json extending root
- src/index.ts: Fastify server, health check GET /health → { status:"ok", timestamp }
- src/config.ts: parseEnv() call, export typed config singleton

apps/dashboard/
- Next.js 14 with App Router, TypeScript, Tailwind, src/ directory

Root package.json scripts:
- dev: turbo dev
- build: turbo build
- lint: turbo lint
- test: turbo test
```

**Test**: `npm install && npm run build` passes.

### 0.2 — Database Schema

```
CONTEXT: specs/DATABASE_SCHEMA.md

In apps/api/, install drizzle-orm, drizzle-kit, postgres, @types/pg.

Create apps/api/src/db/:

schema.ts — ALL tables from DATABASE_SCHEMA.md using Drizzle pgTable:
- tenants, stores, accounting_connections, channels, messages, agent_runs, pending_actions, memories (with vector column), scheduled_jobs, generated_files
- All indexes as specified
- Relations defined

connection.ts:
- Read DATABASE_URL, create postgres client, export db instance
- Export type DB = typeof db

drizzle.config.ts for migration generation.

Add scripts: "db:generate", "db:migrate", "db:studio"

NOTE: For the memories.embedding column, use pgvector's vector type. You'll need to run "CREATE EXTENSION IF NOT EXISTS vector" before migrating.
```

**Test**: `npm run db:generate` produces migration SQL.

### 0.3 — Docker + Seed

```
Root docker-compose.yml:
- postgres:16 port 5432, volume, POSTGRES_DB=kommand, healthcheck
- redis:7-alpine port 6379, healthcheck
- Add init script that runs: CREATE EXTENSION IF NOT EXISTS vector;

scripts/seed.ts:
- Create test tenant: { email:"test@kommand.dev", name:"Raamiz", phone:"+971501234567", timezone:"Asia/Dubai", plan:"growth" }
- Create test store: { platform:"shopify", domain:"test-store.myshopify.com", name:"Test Store", accessTokenEnc/iv/tag: use encryption util with dummy key }
- Create test WhatsApp channel: { type:"whatsapp", identifier:"+971501234567" }
- Create morning_brief scheduled job
- Log created records

Root scripts: "docker:up", "docker:down", "db:seed"
```

**Test**: `npm run docker:up && npm run db:migrate && npm run db:seed` — all pass.

### 0.4 — CI

```
.github/workflows/ci.yml:
- Trigger: push/PR to main
- Jobs: lint+typecheck, test (with Postgres+Redis services), build
- Node 20, npm caching

.eslintrc.cjs: TypeScript plugin, strict rules, no unused vars warn.
```

**Test**: Push, Actions green.

---

## M1: AGENT CORE (5 prompts, 2 days)

This is the heart. Get this right.

### 1.1 — Fastify Server + Routes

```
CONTEXT: packages/shared, apps/api/src/config.ts

Expand apps/api/src/:

index.ts — Full bootstrap:
- Validate env via parseEnv()
- Register @fastify/cors, @fastify/sensible
- Custom error handler: catches errors, returns { success:false, error:{ code, message } }
- Register route files
- Graceful shutdown

routes/webhooks.ts:
- GET  /webhook/whatsapp → WhatsApp verification challenge (return hub.challenge as plain text if verify_token matches)
- POST /webhook/whatsapp → placeholder: log body, return 200
- POST /webhook/shopify → placeholder: log body, return 200

routes/dashboard.ts:
- GET  /api/me → placeholder: return { id:"test", name:"Test" }
- GET  /api/health → { status:"ok", version, uptime }

middleware/rate-limit.ts:
- Redis sliding window rate limiter
- rateLimit(key: string, max: number, windowSeconds: number): Promise<{allowed:boolean, remaining:number}>

utils/errors.ts:
- AppError class: statusCode, code, isOperational
- Error codes: UNAUTHORIZED, NOT_FOUND, VALIDATION_ERROR, RATE_LIMITED, PRIMITIVE_FAILED, AGENT_ERROR
```

**Test**: `curl localhost:3000/api/health` returns OK.

### 1.2 — Primitive Interface + Registry

```
CONTEXT: specs/AGENT_CORE.md (primitive definitions section)

Create apps/api/src/primitives/:

types.ts:
- PrimitiveDefinition = { name: string, description: string, inputSchema: object (JSON Schema), handler: (input: unknown, tenantId: string) => Promise<PrimitiveResult> }
- PrimitiveResult type from shared package

index.ts:
- primitiveRegistry: Map<string, PrimitiveDefinition>
- registerPrimitive(def: PrimitiveDefinition): void
- getPrimitivesForClaude(connectedPlatforms: string[]): array of Claude tool format objects
  - Only include shopify_api if tenant has a Shopify store
  - Only include xero_api if tenant has Xero connection
  - Always include: run_code, web_search, generate_file, send_comms, memory
- executePrimitive(name: string, input: unknown, tenantId: string): Promise<PrimitiveResult>
  - Validates input against schema
  - Calls handler
  - Never throws — wraps errors in PrimitiveResult { success:false, error }
  - Logs: primitive name, input summary (truncated), success/fail, latency

Create placeholder handlers that return mock data for each of the 7 primitives. Each in its own file (shopify.ts, xero.ts, run-code.ts, web-search.ts, generate-file.ts, send-comms.ts, memory.ts). The real implementations come in later milestones. For now:
- shopify_api → return { success:true, data: { orders: [] } }
- run_code → return { success:true, data: { stdout: "mock output" } }
- etc.

Include the FULL Claude tool JSON schema for each primitive exactly as specified in AGENT_CORE.md.
```

**Test**: Call `executePrimitive("shopify_api", { method:"graphql", query:"{ shop { name } }" }, "test-tenant")` → returns mock result.

### 1.3 — Agent Loop

```
CONTEXT: specs/AGENT_CORE.md (agent loop section), apps/api/src/primitives/index.ts

Install @anthropic-ai/sdk.

Create apps/api/src/agent/:

loop.ts — THE agent reasoning loop:
- async function runAgent(input: string, tenantId: string, trigger: "message"|"morning_brief"|"proactive"|"scheduled"): Promise<AgentResponse>
- Implementation follows the pseudocode in AGENT_CORE.md exactly:
  1. buildContext(tenantId)
  2. Check for pending action confirmation
  3. While loop with max 25 iterations
  4. Claude API call with extended thinking enabled, tools from primitive registry
  5. If no tool_use → done, extract text response
  6. If tool_use → execute all primitives in parallel via Promise.all, feed results back
  7. Force wrap-up if hitting iteration limit
- Track: total iterations, total tokens (input+output), all primitive calls, total latency
- Create agent_runs record in DB at start (status:running), update at end (completed/failed/timeout)
- Return: { text, files, agentRunId, iterations, tokensUsed, latencyMs }

Types:
- AgentResponse = { text: string, files?: {url:string,filename:string}[], agentRunId: string, iterations: number, tokensUsed: number, latencyMs: number }

Error handling:
- If Claude API fails: retry once after 2s, then return "I'm having trouble thinking right now. Try again in a minute."
- If a primitive fails: the error is passed to Claude as a tool_result — the agent decides what to do
- If total tokens exceed plan limit: inject message to wrap up on next iteration
```

**Test**: With mock primitives, send "Hello, how are you?" → agent responds with text, 1 iteration, no primitive calls. Send "What are my sales?" → agent calls shopify_api mock, gets result, responds.

### 1.4 — System Prompt + Context Builder

```
CONTEXT: specs/AGENT_CORE.md (system prompt + context builder sections)

Create apps/api/src/agent/:

system-prompt.ts:
- AGENT_PERSONA constant: the full system prompt from AGENT_CORE.md
- buildSystemPrompt(context: AgentContext): string — templates in tenant info, connected platforms, business memory, active alerts

context.ts:
- AgentContext type: { tenant, stores, connections, connectedPlatforms, conversationHistory, businessMemory, pendingAlerts, currentTime }
- buildContext(tenantId: string): Promise<AgentContext>
  - Parallel fetch: tenant, stores, connections, last 15 messages, relevant memories (empty for now until memory primitive is real)
  - Determine connectedPlatforms from stores + connections
  - Format conversation history as Claude messages array [{role,content}]

Also create:

confirmation.ts:
- getPendingAction(tenantId: string): Promise<PendingAction | null> — get the most recent pending action
- isConfirmation(text: string): boolean — checks if text is "yes"/"y"/"confirm"/"no"/"n"/"cancel"
- executePendingAction(action: PendingAction, response: string): Promise<AgentResponse>
  - If confirmed: call executePrimitive with stored name+input, return result
  - If cancelled: update status, return "Cancelled."
  - If ambiguous: return null (feed to agent loop with context)
- createPendingAction(params): Promise<PendingAction> — stores in DB with 10min expiry
- cleanupExpired(): Promise<number> — cron to clear expired actions
```

**Test**: buildContext with seed data returns populated context. buildSystemPrompt includes tenant name and timezone. isConfirmation("yes") → true, isConfirmation("tell me more") → false.

### 1.5 — Message Pipeline (Ingestion → Agent → Response)

```
CONTEXT: apps/api/src/agent/loop.ts, apps/api/src/primitives/index.ts

Create apps/api/src/channels/:

types.ts:
- ChannelAdapter interface: { parseInbound(raw: unknown): InboundMessage | null, sendText(tenantId: string, text: string): Promise<void>, sendButtons(tenantId: string, text: string, buttons: {id:string,title:string}[]): Promise<void>, sendFile(tenantId: string, fileUrl: string, caption: string): Promise<void> }

pipeline.ts — The full message processing pipeline:
- async function processInboundMessage(channelType: string, rawBody: unknown): Promise<void>
  1. Parse via channel adapter → InboundMessage (return early if not a real message)
  2. Deduplicate by channelMsgId (Redis SET, 1hr TTL)
  3. Look up tenant by channel identifier (e.g., phone number)
  4. Truncate message to 4000 chars
  5. Store inbound message in DB
  6. Check rate limit (10/min, 60/hr per tenant)
  7. Run agent: runAgent(message.text, tenantId, "message")
  8. Store outbound message in DB
  9. Send response via channel adapter:
     - If response has files → sendFile for each
     - If response has pending action → sendButtons with Yes/No
     - Otherwise → sendText
  10. Mark inbound as read (WhatsApp blue checkmarks)

Update routes/webhooks.ts POST /webhook/whatsapp:
- Verify signature (placeholder — real verification in M3)
- Call processInboundMessage("whatsapp", body)
- Return 200 immediately (process async)

Create channels/mock-adapter.ts implementing ChannelAdapter:
- parseInbound: extracts text from a simple { text, from } body
- sendText: logs to console
- sendButtons: logs to console
- sendFile: logs to console

Also create a CLI test script at scripts/test-agent.ts:
- Interactive readline loop
- Sends text to processInboundMessage with mock adapter
- Prints agent response to console
- This lets you test the full pipeline without WhatsApp
```

**Test**: `npx tsx scripts/test-agent.ts` → type "Hello" → get agent response. Type "What are my recent orders?" → agent calls shopify_api mock → responds with mock data.

---

## M2: SHOPIFY PRIMITIVE (3 prompts, 1 day)

### 2.1 — Shopify OAuth

```
CONTEXT: specs/SECURITY.md (encryption), apps/api/src/db/schema.ts (stores table)

Create apps/api/src/auth/shopify-oauth.ts:

OAuth routes:
- GET /auth/shopify?shop={domain} — Generate OAuth URL, store nonce in Redis, redirect to Shopify
- GET /auth/shopify/callback — Validate nonce, exchange code for token, encrypt token, store in DB, redirect to dashboard

Create apps/api/src/auth/encryption.ts:
- encrypt(text) and decrypt(enc, iv, tag) per SECURITY.md spec

Make sure the OAuth scopes include everything the agent might need:
read_orders, write_orders, read_products, write_products, read_inventory, write_inventory, read_customers, read_analytics, read_discounts, write_discounts

Test with a Shopify Partner development store.
```

**Test**: Full OAuth flow → token stored encrypted in DB.

### 2.2 — Shopify Primitive (Real Implementation)

```
CONTEXT: apps/api/src/primitives/shopify.ts (replace mock), apps/api/src/auth/encryption.ts

Replace the mock shopify.ts with the real implementation:

async function handleShopifyApi(input: ShopifyApiInput, tenantId: string): Promise<PrimitiveResult>
1. Look up active store for tenant
2. Decrypt access token
3. Based on input.method:
   - "graphql": POST to https://{domain}/admin/api/2024-10/graphql.json with query + variables
   - "rest_get": GET https://{domain}/admin/api/2024-10/{path}
   - "rest_post": POST https://{domain}/admin/api/2024-10/{path} with body
   - "rest_put": PUT same
   - "rest_delete": DELETE same
4. Handle Shopify rate limiting: if 429, wait Retry-After header, retry once
5. Handle errors: return { success:false, error: human-friendly message }
6. Return: { success:true, data: response body }

Important: the agent writes the GraphQL queries. The primitive just proxies. Don't add any business logic here. Don't parse or transform the Shopify response — return it raw so the agent can reason about it.

Wrap the Shopify response data in the XML tag pattern for prompt injection defense:
Return data as: { success:true, data: shopifyResponse } but in the agent loop, when formatting tool_result for Claude, wrap it: "<business_data source=\"shopify\">{JSON}</business_data>"
```

**Test**: With a real Shopify dev store, agent can answer "What's my store name?" (writes a simple shop query), "Show me my last 3 orders" (writes an orders query), "How many products do I have?" (writes a products count query). All from natural language — no hardcoded queries.

### 2.3 — Shopify Webhooks

```
Create apps/api/src/routes/shopify-webhooks.ts:

POST /webhook/shopify:
1. Verify HMAC-SHA256 signature
2. Parse X-Shopify-Topic header to determine event type
3. Handle events:
   - orders/create: queue a notification to the owner via the agent
   - orders/cancelled: same
   - app/uninstalled: deactivate the store, notify owner
   - customers/data_request: GDPR — queue data export
   - customers/redact: GDPR — queue data deletion
   - shop/redact: GDPR — queue full tenant data deletion

For order notifications, don't use a template. Run a mini agent:
  runAgent("New order just came in: #{order_name} from {customer_name} for {total}. Let the owner know with a brief notification. Also check if any items in this order are now low stock.", tenantId, "proactive")

Register webhooks during OAuth callback: POST to Shopify to subscribe to these topics.
```

**Test**: Simulate a Shopify order webhook → owner gets a WhatsApp notification with order details + stock check.

---

## M3: WHATSAPP CHANNEL (3 prompts, 1 day)

### 3.1 — WhatsApp Inbound

```
CONTEXT: specs/SECURITY.md (webhook verification), apps/api/src/channels/types.ts

Create apps/api/src/channels/whatsapp.ts implementing ChannelAdapter:

parseInbound(raw: WebhookPayload): InboundMessage | null
- Verify X-Hub-Signature-256 header using WHATSAPP_APP_SECRET (crypto.timingSafeEqual)
- Extract from the deeply nested Meta webhook format:
  - entry[0].changes[0].value.messages[0] → actual message
  - Handle types: text (body), interactive (button_reply.id, list_reply.id)
  - Ignore: statuses, typing indicators, reactions, read receipts
- Normalize phone number to E.164
- Return InboundMessage or null if not a processable message

Update routes/webhooks.ts:
- GET /webhook/whatsapp: return hub.challenge if verify_token matches (plain text response!)
- POST /webhook/whatsapp: pass to processInboundMessage("whatsapp", req.body) — run async, return 200 immediately
```

**Test**: Send a real WhatsApp message to the webhook → it parses correctly and reaches the agent.

### 3.2 — WhatsApp Outbound

```
CONTEXT: apps/api/src/channels/whatsapp.ts

Add outbound methods to the WhatsApp adapter:

sendText(tenantId: string, text: string): Promise<void>
- Look up tenant's WhatsApp channel → get phone number
- POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
  body: { messaging_product:"whatsapp", to:phone, type:"text", text:{ body:formatForWhatsApp(text) } }

sendButtons(tenantId: string, text: string, buttons: {id,title}[]): Promise<void>
- Max 3 buttons (WhatsApp limit). If more, use sendList.
- interactive message with type:"button"

sendFile(tenantId: string, fileUrl: string, caption: string): Promise<void>
- Determine type from URL extension: .pdf→document, .png/.jpg→image, .xlsx→document
- Send as media message with caption

sendList(tenantId: string, text: string, items: {id,title,description?}[]): Promise<void>
- For longer option lists (max 10)

Helper: formatForWhatsApp(text: string): string
- Convert **bold** to *bold*
- Convert `code` to ```code```
- Truncate to 4096 chars with "..." if needed

Also: markAsRead(messageId: string) — POST to mark message as read (blue checkmarks)
```

**Test**: Agent responds to a real WhatsApp message. Test with text, buttons, and a file (mock PDF URL).

### 3.3 — Phone Number Linking

```
CONTEXT: apps/api/src/db/schema.ts (channels table)

Create the WhatsApp phone linking flow:

routes/dashboard.ts — add:
- POST /api/channels/whatsapp/link
  body: { phone: string }
  - Normalize phone to E.164
  - Store in channels table for the authenticated tenant
  - Send a welcome message via WhatsApp: "Hey {name}! Kommand is connected. Try asking me: How's my store doing?"
  - Return { success: true }

- DELETE /api/channels/whatsapp
  - Remove the channel record
  - Return { success: true }

Update the inbound pipeline:
- When a WhatsApp message arrives, look up tenant by phone number in channels table
- If no tenant found: reply "This number isn't linked to a Kommand account. Set up at kommand.dev" and stop processing
```

**Test**: Link a phone → send WhatsApp message → agent responds. Unlink → send message → get "not linked" reply.

---

## M4: CODE EXECUTION + FILES (3 prompts, 1 day)

### 4.1 — E2B Sandbox Primitive

```
Install @e2b/code-interpreter (E2B's official SDK).

Replace the mock apps/api/src/primitives/run-code.ts with real implementation:

async function handleRunCode(input: { code: string }, tenantId: string): Promise<PrimitiveResult>
1. Create E2B sandbox: Sandbox.create({ apiKey: E2B_API_KEY, template: "python-data-analysis" })
   - E2B has a pre-built template with pandas, numpy, matplotlib, scipy, scikit-learn
2. Install additional packages if needed (first run only, cached):
   await sandbox.commands.run("pip install reportlab openpyxl python-pptx Pillow")
3. Execute the code:
   const result = await sandbox.runCode(input.code, { timeout: 30000 })
4. Collect stdout
5. List files in /tmp/: sandbox.files.list("/tmp/")
6. For each generated file in /tmp/:
   - Download content: sandbox.files.read(path)
   - Upload to Supabase Storage under tenantId namespace
   - Generate signed URL (24hr expiry)
   - Store in generated_files table
7. Close sandbox
8. Return: { success:true, data: { stdout, files: [{url, filename, contentType}] } }

Error handling:
- Code error (syntax, runtime): return { success:false, error: stderr message }
- Timeout: return { success:false, error: "Code execution timed out after 30 seconds." }
- E2B API error: retry once, then return error

Security: The code runs in E2B's isolated sandbox. No access to our DB, no access to env vars, no network access to our infra. Safe by design.
```

**Test**: Agent asked "Calculate the first 20 fibonacci numbers" → writes Python → executes → returns result. Agent asked "Create a bar chart of these numbers: Q1=100, Q2=150, Q3=120, Q4=200" → writes matplotlib code → generates PNG → returns file URL.

### 4.2 — File Generation + Storage

```
CONTEXT: apps/api/src/primitives/run-code.ts

Set up Supabase Storage:

utils/storage.ts:
- import { createClient } from "@supabase/supabase-js"
- uploadFile(tenantId: string, filename: string, content: Buffer, contentType: string): Promise<string>
  - Upload to bucket/tenant_id/agent_runs/{filename}
  - Generate signed URL with 24hr expiry
  - Return the signed URL
- deleteExpiredFiles(): Promise<number>
  - Query generated_files where expires_at < now()
  - Delete from storage + DB
  - Run as daily cron

Replace the mock generate-file.ts primitive:
- For simple files (text, CSV, JSON, markdown): create in-memory, upload to storage
- For complex files: the agent should use run_code instead (system prompt guides this)

Update the WhatsApp outbound to handle files:
- When AgentResponse includes files, send each as a WhatsApp document/image message
- PDF and XLSX → document type with caption
- PNG/JPG → image type with caption
```

**Test**: Ask agent "Give me a CSV of sample data" → generates file → sends via WhatsApp as downloadable document.

### 4.3 — Web Search Primitive

```
Replace the mock web-search.ts:

Sign up for Serper API (serper.dev) — $50/mo for 50K searches. Or use Brave Search API (free tier).

async function handleWebSearch(input: { action: "search"|"fetch_url", query: string }, tenantId: string): Promise<PrimitiveResult>

For action "search":
- POST https://google.serper.dev/search with { q: input.query, num: 5 }
- Return: { success:true, data: { results: [{title, link, snippet}] } }

For action "fetch_url":
- Fetch the URL with a 10s timeout
- Extract readable text (use @mozilla/readability or a simple HTML-to-text)
- Truncate to 8000 chars
- Return: { success:true, data: { url, title, content } }

Rate limit: 50 searches per tenant per day.
Wrap returned content in <business_data source="web"> tags for prompt injection defense.
```

**Test**: Agent asked "What are the latest ecommerce trends in the UAE?" → searches web → synthesizes answer from results.

---

## M5: DASHBOARD (5 prompts, 2 days)

### 5.1 — Next.js + Auth Shell

```
CONTEXT: /mnt/skills/public/frontend-design/SKILL.md

In apps/dashboard/:

Install: @clerk/nextjs, @clerk/themes, next-themes

Set up:
- src/middleware.ts: Clerk protecting all routes except /, /sign-in, /sign-up, /pricing
- src/app/layout.tsx: ClerkProvider, ThemeProvider, fonts, Tailwind
- src/app/(auth)/sign-in/page.tsx, sign-up/page.tsx: Clerk components
- src/app/(app)/layout.tsx: dashboard shell with sidebar nav:
  - Nav items: Overview, Connections, Preferences, Chat Log
  - Top bar: store name, UserButton
- src/lib/api.ts: fetch wrapper with Clerk token injection

Design: Clean, fast, minimal. White/gray + deep purple (#534AB7) accent. shadcn/ui components.
Install shadcn components: button, card, input, label, badge, separator, dialog, toast, tabs, switch
```

**Test**: Dashboard loads, auth works, nav renders.

### 5.2 — Landing Page

```
CONTEXT: /mnt/skills/public/frontend-design/SKILL.md

apps/dashboard/src/app/page.tsx — single-page marketing site:

Sections:
1. Hero: "Your business, as a conversation." + subtitle about running your store from WhatsApp + CTA + mock WhatsApp conversation showing the agent handling a complex request
2. The problem: "You manage 8 apps to run 1 business" → visual showing app chaos vs Kommand simplicity
3. What makes it different: Not a chatbot — an agent. Show example: owner asks for a 6-month comparison PDF report → agent pulls data, analyzes, generates, delivers.
4. Capabilities: Show real example exchanges — not a feature grid. Each one demonstrates the agent doing something no chatbot can do.
5. Pricing: 3 plans from PROJECT_BIBLE.md
6. CTA: "Start free trial" → sign up

Design: Bold, premium, dark hero. Make the WhatsApp mock conversation the centerpiece — it should make visitors think "I need this."
```

**Test**: Visual inspection desktop + mobile.

### 5.3 — Onboarding: Connect Shopify

```
apps/dashboard/src/app/(app)/onboarding/page.tsx:

3-step wizard with progress indicator.

Step 1 — Connect Shopify:
- Input: Store URL (mystore.myshopify.com) with validation
- "Connect Shopify" button → calls POST /api/connections/shopify/initiate → redirects to Shopify OAuth
- After OAuth success: show green checkmark + store name
- Skip option

Backend (in apps/api routes/dashboard.ts):
- POST /api/connections/shopify/initiate: validate domain format, generate OAuth URL, return URL
- GET /auth/shopify/callback already exists from M2
- After successful OAuth, redirect to /onboarding?step=2
```

### 5.4 — Onboarding: Link WhatsApp + Preferences

```
Step 2 — Link WhatsApp:
- Phone number input with country code dropdown (default UAE +971)
- "Link WhatsApp" button → POST /api/channels/whatsapp/link
- Shows "We sent you a welcome message on WhatsApp!" confirmation
- Skip option

Step 3 — Preferences:
- Timezone (auto-detect, dropdown override)
- Morning brief time (time picker, default 8:00 AM)
- Currency display (auto from Shopify, override)
- Notification toggles: new orders, low stock, daily brief
- "Complete Setup" → POST /api/preferences + create default scheduled jobs → redirect to dashboard with success toast

Backend:
- PUT /api/preferences: updates tenant preferences + creates/updates scheduled_jobs
```

### 5.5 — Settings + Chat Log

```
apps/dashboard/src/app/(app)/connections/page.tsx:
- Card per connected platform: icon, name, status badge, domain/phone, last used, disconnect button
- "Add Connection" section with available platforms

apps/dashboard/src/app/(app)/chat-log/page.tsx:
- Chat-style view of owner ↔ agent conversation
- Owner messages right (purple bubbles), agent messages left (gray)
- Expandable sections for primitive calls: "📊 shopify_api — orders query" → shows input/output
- File messages show download links
- Pagination: last 50, "Load more"
- Search bar

apps/dashboard/src/app/(app)/preferences/page.tsx:
- All preferences from onboarding step 3, editable
- Memory viewer: list of agent memories, owner can delete individual ones
- Usage stats: agent runs this month, tokens used, plan limit

Backend routes:
- GET /api/connections
- DELETE /api/connections/:id
- GET /api/messages?limit=50&offset=0
- GET /api/messages/search?q=
- GET /api/memories
- DELETE /api/memories/:id
- GET /api/usage — runs, tokens, limits
```

**Test**: Full onboarding flow end-to-end. Settings pages render with real data.

---

## M6: MEMORY + PROACTIVE (4 prompts, 1.5 days)

### 6.1 — Memory Primitive (Real Implementation)

```
Install openai (for embeddings) — we use text-embedding-3-small which is cheap and fast.
OR use Anthropic's embedding if available. OpenAI embeddings are $0.02/1M tokens — negligible cost.

Replace mock memory.ts:

For action "write":
1. Generate embedding: openai.embeddings.create({ model:"text-embedding-3-small", input: query })
2. Insert into memories table: content, category, embedding vector, source_run_id, tenant_id
3. Return { success:true, data: { stored: true } }

For action "read":
1. Generate embedding of the query
2. Vector similarity search: SELECT * FROM memories WHERE tenant_id = $1 ORDER BY embedding <=> $2 LIMIT 20
3. Return { success:true, data: { memories: [{content, category, createdAt}] } }

Update context builder (agent/context.ts):
- On every agent run, do a memory read with the owner's current message as query
- Inject top 20 relevant memories into the system prompt
- This gives the agent persistent knowledge across conversations
```

**Test**: Tell agent "Remember that my main supplier is Al Noor Textiles, contact Ahmed at +971501234567". Later in a new conversation: "What's my supplier's number?" → agent recalls from memory.

### 6.2 — Job Scheduler

```
Install bullmq.

Create apps/api/src/proactive/scheduler.ts:

JobScheduler class:
- Uses BullMQ with Redis
- On startup: load all active scheduled_jobs from DB, register with BullMQ
- Job processor: when a job fires, run the agent with the job's prompt
  - runAgent(job.prompt, tenantId, job.jobType)
  - Update last_run_at, calculate next_run_at
- Default jobs created during onboarding:
  - morning_brief: cron based on tenant's preferred time
  - proactive_analysis: every 6 hours, staggered per tenant

Handle: retries (3 attempts, exponential backoff), dead letter queue, error logging.
```

**Test**: Create a job with a 1-minute cron → fires → agent runs → message sent.

### 6.3 — Morning Brief

```
CONTEXT: apps/api/src/proactive/scheduler.ts, specs/AGENT_CORE.md (proactive analysis section)

The morning brief is just a scheduled agent run with a specific prompt. No templates, no special code.

In scheduler.ts, when a morning_brief job fires:

const briefPrompt = `Generate the morning business brief.

Pull yesterday's full day data and any overnight activity. Present:
- Revenue and orders vs a typical day (use memory for baselines — if you don't have baselines yet, just present the numbers and note you're establishing baselines)
- Any orders needing attention (unfulfilled, failed payments)
- Inventory alerts (items running low based on velocity)
- Cash position and overdue invoices (if Xero connected)
- One actionable recommendation for today

Format for WhatsApp mobile reading. Use emoji section headers. Under 300 words.
End with: "Reply with anything or ask me to dig deeper on any of these."`;

await runAgent(briefPrompt, tenantId, "morning_brief");

That's it. The agent pulls data, analyzes it, formats it, sends it. No hard-coded report templates.
```

**Test**: Manually trigger morning brief for test tenant → receive a real brief on WhatsApp with live Shopify data.

### 6.4 — Proactive Analysis

```
The 6-hourly proactive analysis, also just an agent prompt:

const analysisPrompt = `Run a periodic business health check.

Pull key metrics from the last 6 hours. Compare against:
1. Same window yesterday
2. Trailing 7-day average for this time window (use memory or calculate)

Look for anything an owner should know about:
- Revenue or order volume anomalies (>20% deviation from norm)
- Inventory items that will stock out within 3 days at current velocity
- Overdue invoices (if Xero connected)
- Unusual patterns: spike in a specific product, new geography, return rate changes
- Anything else a sharp COO would flag

If you find something worth reporting:
- Write a concise alert message
- Include the specific numbers
- Suggest a concrete action
- End with a question to prompt engagement

If nothing notable, store any updated baselines in memory and respond with exactly: NO_ALERT

Always update memory with current baselines and patterns you observe.`;

const result = await runAgent(analysisPrompt, tenantId, "proactive");
if (!result.text.includes("NO_ALERT")) {
  // Agent already sent the message via the normal pipeline
}
```

**Test**: Manually trigger proactive analysis → if test store has notable data, owner gets an alert. If not, agent stores baselines silently.

---

## M7: XERO PRIMITIVE (2 prompts, half day)

### 7.1 — Xero OAuth

```
CONTEXT: apps/api/src/auth/shopify-oauth.ts (pattern reference)

apps/api/src/auth/xero-oauth.ts:
- GET /auth/xero → Generate Xero OAuth2 URL with PKCE (code_verifier in Redis)
- GET /auth/xero/callback → Exchange code, fetch tenant connections, encrypt tokens, store in DB

apps/api/src/auth/xero-token-refresh.ts:
- Xero access tokens expire in 30 minutes
- Before each xero_api call: check token_expires_at
- If expiring within 5 min: refresh using refresh_token
- Use Redis lock to prevent concurrent refresh races
- Update encrypted tokens in DB

Dashboard: add Xero to the connections page (same pattern as Shopify).
```

### 7.2 — Xero Primitive (Real Implementation)

```
Replace mock xero.ts:

async function handleXeroApi(input: { method, path, body? }, tenantId: string): Promise<PrimitiveResult>
1. Look up accounting_connection for tenant
2. Refresh token if needed
3. Decrypt access token
4. Call https://api.xero.com/api.xro/2.0/{path}
   Headers: Authorization: Bearer {token}, Xero-tenant-id: {org_id}, Content-Type: application/json
5. Return raw response

Same pattern as Shopify: the agent writes the API calls, the primitive just proxies and authenticates.
```

**Test**: Agent asked "What invoices are overdue?" → writes Xero API call → returns real data. "Create an invoice for Ahmed, 10 hours consulting at $150/hr" → agent constructs Xero invoice JSON → creates draft.

---

## M8: LAUNCH PREP (5 prompts, 2 days)

### 8.1 — Security Hardening

```
Audit and implement everything from specs/SECURITY.md:
- Verify ALL webhook signature checks are in place and use timingSafeEqual
- Verify all DB queries include tenant_id filter
- Verify all OAuth tokens are encrypted
- Add request size limits (1MB max body)
- Add input sanitization for WhatsApp messages (strip potential injection patterns from output)
- Verify E2B sandbox has no network access to our infra
- Add CORS configuration (dashboard domain only)
- Add Helmet headers
```

### 8.2 — Shopify App Store Submission

```
Prepare Shopify App Store listing:

1. App listing copy: name, tagline, description, screenshots, demo video script
2. Privacy policy page (required): what data we access, how we store it, encryption, GDPR rights
3. GDPR webhooks (already in M2): customers/data_request, customers/redact, shop/redact
4. App review checklist: OAuth flow works, webhook verification, billing, uninstall handling

Create apps/dashboard/src/app/privacy/page.tsx with the privacy policy.
Create apps/dashboard/src/app/terms/page.tsx with terms of service.
```

### 8.3 — Billing

```
Implement Shopify Billing API for merchants who install from the App Store:

apps/api/src/billing/shopify-billing.ts:
- After OAuth, create a recurring charge: POST /admin/api/2024-10/recurring_application_charges.json
- 14-day free trial
- Plans: Starter $29, Growth $59, Pro $149
- Handle charge activation callback
- Check active charge before each agent run
- Downgrade handling: if charge cancelled, set plan to "expired"

For standalone signups (not via Shopify): Stripe Checkout integration.
- POST /api/billing/checkout → create Stripe Checkout session
- Webhook for payment events
```

### 8.4 — Monitoring + Logging

```
Install @sentry/node, @sentry/profiling-node.

apps/api/src/utils/monitoring.ts:
- Sentry init with tracing enabled
- Capture all unhandled exceptions
- Capture all agent errors with context (tenantId, trigger, primitive calls)
- Performance traces on agent runs

Structured logging:
- Every agent run: { tenantId, trigger, iterations, tokensUsed, latencyMs, primitiveCalls, status }
- Every primitive call: { tenantId, primitive, latencyMs, success }
- Every webhook: { channel, event, tenantId, processingMs }
- Format: JSON, ship to Axiom or stdout for Railway

Uptime monitoring: set up on UptimeRobot or Better Uptime (free tier)
```

### 8.5 — Load Testing

```
Install k6 or use Artillery.

scripts/load-test.ts:
- Simulate 50 concurrent tenants sending messages
- Each tenant sends 1 message every 30 seconds
- Measure: response latency (p50, p95, p99), error rate, Claude API throughput
- Run for 10 minutes

Based on results:
- Tune Fastify connection limits
- Add database connection pooling if needed
- Optimize context builder queries (batch, cache tenant data in Redis)
- Ensure Redis rate limiting handles concurrent access
- Profile and optimize the hottest paths
```

**Test**: Load test completes with p95 < 8 seconds, 0% error rate.

---

## Post-M8: What's Next

After launch, in priority order:

1. **Slack channel adapter** — same ChannelAdapter interface, new implementation
2. **Telegram adapter** — same pattern
3. **WooCommerce primitive** — same as Shopify but REST API
4. **QuickBooks primitive** — same as Xero
5. **send_comms with email** — SendGrid integration
6. **Team/multi-user** — multiple WhatsApp numbers per tenant, role-based access
7. **Custom scheduled workflows** — owner says "Every Monday, email me a P&L summary" → agent creates its own cron job
8. **OpenClaw plugin** — publish Kommand as an OpenClaw skill for their user base

---

## Prompt Execution Checklist

Total: **34 prompts across 9 milestones**
Estimated: **~12 working days with AI coding tools**

First testable end-to-end: after M0+M1+M2+M3 = **~4.5 days**
First "holy shit" moment: after M4 (code execution + files) = **~5.5 days**

After each prompt:
- [ ] Compiles: `npx tsc --noEmit`
- [ ] Tests pass: `npm run test`
- [ ] Smoke test works (manual or via test-agent.ts CLI)
- [ ] Commit: `git commit -m "M{x}.{y}: description"`
