# KOMMAND — Project Bible v2

> Your business, as a conversation.

This is the complete technical blueprint for Kommand. Load this file as context in every AI coding session.

---

## What Kommand Is

An autonomous AI agent that runs a small business owner's operations through WhatsApp. Not a chatbot. Not a notification bot. An agent that reasons about your business, takes action across your tools, and proactively tells you what matters.

The owner texts their business like they'd text a COO. The agent figures out the rest.

## What Makes This Different From Everything Else

Every WhatsApp-for-business product on the market is customer-facing. Kommand is owner-facing. Every existing integration is a fixed menu of commands. Kommand is an agent that writes its own queries, chains its own workflows, and generates artifacts (PDFs, spreadsheets, charts) on the fly.

The agent has 7 primitives. From those 7 primitives it can handle thousands of requests — including ones you never anticipated — because it reasons about what to do rather than pattern-matching to a tool.

---

## Architecture

```
Owner (WhatsApp) ──→ Channel Adapter ──→ Agent Loop ──→ Channel Adapter ──→ Owner
                                            │
                                     ┌──────┴──────┐
                                     │   Primitives │
                                     ├──────────────┤
                                     │ shopify_api  │
                                     │ xero_api     │
                                     │ run_code     │
                                     │ web_search   │
                                     │ generate_file│
                                     │ send_comms   │
                                     │ memory       │
                                     └──────────────┘
```

That's it. The entire system is:
1. A channel adapter that normalizes WhatsApp webhooks
2. An agent loop that reasons and calls primitives until the task is done
3. Seven primitives that give the agent access to the real world
4. A database that stores tenants, credentials, conversations, and business memory
5. A dashboard for onboarding and settings (not for daily use — WhatsApp is the UI)

No tool registry. No intent matching. No response templates. The agent thinks.

### The Agent Loop

```
receive_message(owner_message)
  → load_context(owner's stores, connections, memory, last 15 messages)
  → while not done (max 25 iterations):
      → claude(system_prompt + context + conversation, primitives, extended_thinking=true)
      → if response is text only → done, send to owner
      → if response has tool_use blocks:
          → execute each primitive call in parallel where possible
          → feed results back as tool_results
          → continue loop
      → if iteration 20+ → force wrap-up: "summarize what you have and deliver"
  → format response for WhatsApp (text, buttons, images, files)
  → send to owner
  → store conversation + any memory updates
```

Key: extended thinking is on. The agent reasons before acting. It plans multi-step workflows internally before executing the first primitive. This is what makes "compare 6 months and give me a PDF" possible — the agent thinks through the entire plan, then executes.

### The 7 Primitives

These are thin. Each one is an authenticated proxy. The agent decides what to send.

| Primitive | What it wraps | The agent's power |
|-----------|--------------|-------------------|
| `shopify_api` | Authenticated GraphQL/REST proxy to the owner's Shopify store | Agent writes any query. Get orders, products, customers, inventory, analytics. Create refunds, discounts, fulfillments. Any Shopify Admin API operation. |
| `xero_api` | Authenticated REST proxy to the owner's Xero org | Agent calls any Xero endpoint. Invoices, bills, reports, contacts, bank transactions. Full read/write. |
| `run_code` | Sandboxed Python execution via E2B | Agent writes and runs Python code. Data analysis (pandas), chart generation (matplotlib), number crunching, forecasting, any computation. Returns stdout + generated files. |
| `web_search` | Web search + page fetch | Agent searches the web and reads pages. Competitor research, find product images, market data, shipping rates, anything public. |
| `generate_file` | File creation via code sandbox | Agent creates PDFs (reportlab), PPTX (python-pptx), XLSX (openpyxl), images (PIL). Files are uploaded and a download link sent via WhatsApp. |
| `send_comms` | Send email or WhatsApp message to a third party on the owner's behalf | Agent drafts and sends messages to customers, suppliers, accountants. Always requires owner confirmation before sending. |
| `memory` | Read/write to the business knowledge store | Agent stores observations, patterns, owner preferences, supplier contacts, seasonal data. Reads this context before every interaction. |

The critical insight: `run_code` is the most powerful primitive. It turns every data question into a solvable problem. "Compare 6 months vs the 6 before" isn't a pre-built report — the agent pulls order data via `shopify_api`, writes Python to analyze it, generates charts, and uses `generate_file` to build a PDF. All composed at runtime.

### Multi-Tenancy

Every primitive call is scoped to a tenant. The agent never sees credentials — primitives receive a `tenant_id` and the primitive layer handles auth token decryption and API authentication. Tenant isolation is enforced at the primitive layer, not the agent layer.

```
Agent calls: shopify_api({ query: "{ orders(first: 10) { ... } }" })
Primitive layer: look up tenant → decrypt token → call Shopify → return data
Agent sees: order data. Never sees tokens, other tenants, or raw credentials.
```

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Runtime** | Node.js 20 + TypeScript | Best async I/O, largest AI training corpus |
| **API framework** | Fastify | Fast, schema validation, great TypeScript support |
| **Database** | PostgreSQL 16 (Supabase) | JSONB for flexible agent data, pgvector for memory embeddings |
| **Cache / Queue** | Redis (Upstash) | Message dedup, rate limiting, job scheduling |
| **AI** | Anthropic Claude API (claude-sonnet-4-20250514) | Best tool use, extended thinking, instruction following |
| **Code sandbox** | E2B | Hosted sandboxed Python runtime via API. No infra to manage. Pre-installed pandas, matplotlib, reportlab, openpyxl, python-pptx. |
| **File storage** | Supabase Storage (S3-compatible) | Store generated files, serve download links |
| **WhatsApp** | Meta Cloud API | Direct, no middleman, free tier |
| **Web dashboard** | Next.js 14 + Tailwind + shadcn/ui | Onboarding + settings only |
| **Auth** | Clerk | OAuth for dashboard, JWT verification |
| **Hosting** | Railway (API) + Vercel (Dashboard) | Simple, scalable |
| **Monitoring** | Sentry + Axiom | Errors + structured logs |

### Why Not OpenClaw

OpenClaw solves the channel routing problem elegantly but is single-user/self-hosted. Kommand is a multi-tenant SaaS distributed via the Shopify App Store. The architectures are fundamentally incompatible. We use OpenClaw's ideas (skill-based primitives, multi-channel gateway concept) but build our own multi-tenant implementation.

---

## Repository Structure

```
kommand/
├── PROJECT_BIBLE.md
├── package.json                    ← npm workspaces
├── turbo.json
├── docker-compose.yml              ← Local Postgres + Redis
├── .env.example
│
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── index.ts            ← Fastify entry
│   │       ├── config.ts           ← Env validation + constants
│   │       ├── agent/
│   │       │   ├── loop.ts         ← The agent reasoning loop
│   │       │   ├── system-prompt.ts← The agent's persona + instructions
│   │       │   └── context.ts      ← Builds context for each interaction
│   │       ├── primitives/
│   │       │   ├── shopify.ts      ← Authenticated Shopify API proxy
│   │       │   ├── xero.ts         ← Authenticated Xero API proxy
│   │       │   ├── run-code.ts     ← E2B sandbox execution
│   │       │   ├── web-search.ts   ← Search + fetch
│   │       │   ├── generate-file.ts← File creation via sandbox
│   │       │   ├── send-comms.ts   ← Email/WhatsApp to third parties
│   │       │   ├── memory.ts       ← Business knowledge store
│   │       │   └── index.ts        ← Registers all primitives as Claude tools
│   │       ├── channels/
│   │       │   ├── whatsapp.ts     ← Inbound/outbound WhatsApp adapter
│   │       │   └── types.ts        ← Channel-agnostic message types
│   │       ├── auth/
│   │       │   ├── shopify-oauth.ts
│   │       │   ├── xero-oauth.ts
│   │       │   └── encryption.ts   ← AES-256-GCM for tokens
│   │       ├── proactive/
│   │       │   ├── scheduler.ts    ← BullMQ job scheduler
│   │       │   └── analysis.ts     ← Periodic business analysis agent runs
│   │       ├── db/
│   │       │   ├── schema.ts       ← Drizzle ORM tables
│   │       │   └── connection.ts
│   │       ├── routes/
│   │       │   ├── webhooks.ts     ← WhatsApp + Shopify + Xero webhooks
│   │       │   └── dashboard.ts    ← API routes for the web dashboard
│   │       └── utils/
│   │           ├── errors.ts
│   │           └── rate-limit.ts
│   │
│   └── dashboard/                  ← Next.js — onboarding + settings only
│       └── src/
│           ├── app/
│           │   ├── page.tsx        ← Landing page
│           │   ├── (auth)/         ← Clerk sign-in/up
│           │   └── (app)/          ← Onboarding, settings, connection log
│           ├── components/
│           └── lib/
│
├── packages/
│   └── shared/                     ← Types, schemas, constants
│       └── src/
│           ├── types.ts
│           └── schemas.ts
│
└── scripts/
    ├── seed.ts
    └── test-agent.ts               ← CLI to test agent without WhatsApp
```

Note what's NOT here: no `tools/` directory with 25 handler files. No `response-formatter.ts` with template strings. No `confirmation-engine.ts` with tier classifications. The agent handles all of that through reasoning.

---

## The System Prompt

This is the single most important piece of code in the project. It lives in `apps/api/src/agent/system-prompt.ts`. The full spec is in `specs/AGENT_CORE.md`. Here is the condensed version:

```
You are Kommand — an autonomous business operations agent. You work for {{owner_name}} who runs {{store_name}}.

You have 7 primitives. You can call them in any combination, any number of times, to accomplish any task the owner asks. You are not limited to predefined commands. You reason about what's needed and compose workflows from primitives.

THINK BEFORE YOU ACT. Use extended thinking to plan multi-step workflows before executing the first primitive. If the owner asks for a report, plan the entire data → analysis → generation pipeline before pulling the first data point.

PRIMITIVES:
- shopify_api: Execute any Shopify Admin API GraphQL query or REST call. You write the query.
- xero_api: Call any Xero API endpoint. You construct the request.
- run_code: Run Python code in a sandbox. Pre-installed: pandas, matplotlib, numpy, reportlab, openpyxl, python-pptx, Pillow. Use this for ALL data analysis, chart generation, and computation.
- web_search: Search the web and fetch page contents.
- generate_file: Create and return a downloadable file (PDF, PPTX, XLSX, PNG). Use run_code to generate it, then return the file URL.
- send_comms: Draft and send a message (email or WhatsApp) to someone on the owner's behalf. ALWAYS show the draft to the owner and get explicit confirmation before sending.
- memory: Read or write to the business knowledge store. Use this to remember patterns, preferences, supplier info, seasonal trends, and anything that will help you serve this owner better over time.

CONFIRMATION RULES:
- Reading data: never confirm. Just do it.
- Creating/sending things (invoices, emails, discounts): show preview, ask "Send this?" with Yes/No buttons.
- Modifying/deleting things (refunds, cancellations, price changes): show full details of what will change, ask for explicit confirmation.
- Bulk operations (anything affecting >5 items): show impact summary, require the owner to type "confirm".
- NEVER execute send_comms without showing the draft first.

COMMUNICATION STYLE:
- You are a concise, sharp COO. Lead with the answer.
- Use real numbers from their actual data. Never generic advice.
- Format for mobile WhatsApp: short paragraphs, emoji anchors (📦 ✅ ⚡ 📊), line breaks.
- When you generate a file, describe what's in it briefly and send the download link.
- Don't explain your process. Don't say "Let me check that for you." Just do it and present results.

PROACTIVE BEHAVIOR:
- When you notice something notable in data you pulled for any reason, mention it even if the owner didn't ask. "By the way — your return rate jumped to 8% this week, up from 3% average. Want me to look into which products are driving it?"
- When asked a simple question and the data reveals something important, surface it. Don't wait to be asked.

WHAT YOU NEVER DO:
- Never fabricate data. If a primitive call fails, say so.
- Never expose API errors, tokens, or technical details.
- Never suggest the owner "check the dashboard." You ARE the dashboard.
- Never refuse a reasonable business request. If you can compose it from primitives, do it.
```

---

## Milestone Summary

| # | Milestone | What Ships | Prompts | Days |
|---|-----------|-----------|---------|------|
| M0 | Scaffold | Monorepo, DB, types, Docker, CI | 4 | 0.5 |
| M1 | Agent core | Reasoning loop, system prompt, primitive interface, context builder | 5 | 2 |
| M2 | Shopify primitive + OAuth | Authenticated Shopify proxy, OAuth install flow | 3 | 1 |
| M3 | WhatsApp channel | Inbound/outbound messages, webhook verification, rich formatting | 3 | 1 |
| M4 | Code execution + files | E2B sandbox, file generation, Supabase Storage upload, WhatsApp file sending | 3 | 1 |
| M5 | Dashboard | Landing page, onboarding flow (connect Shopify, link WhatsApp, prefs), settings | 5 | 2 |
| M6 | Memory + proactive | Business knowledge store (pgvector), periodic analysis runs, morning brief | 4 | 1.5 |
| M7 | Xero primitive + OAuth | Authenticated Xero proxy, OAuth flow, dashboard connection | 2 | 0.5 |
| M8 | Launch prep | Security hardening, Shopify App Store submission, billing, monitoring, load test | 5 | 2 |
| **Total** | | | **34** | **~12 days** |

### Milestone Dependencies

```
M0 ──→ M1 ──→ M2 ──→ M3  (can test end-to-end after M3)
              └──→ M4     (code execution, can develop in parallel with M3)
              └──→ M5     (dashboard, can develop in parallel)
              └──→ M7     (Xero, whenever)
         M1 + M4 ──→ M6  (proactive needs agent + code execution)
         ALL ──→ M8       (launch prep last)
```

First "holy shit" moment: after M0+M1+M2+M3 (~4.5 days), the owner can WhatsApp the agent and ask open-ended business questions. After M4 (~1 more day), they can request reports and files.

---

## Environment Variables

```env
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000
DASHBOARD_URL=http://localhost:3001

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kommand
REDIS_URL=redis://localhost:6379

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Code sandbox
E2B_API_KEY=e2b_...

# File storage
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_STORAGE_BUCKET=kommand-files

# WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=kommand-verify
WHATSAPP_APP_SECRET=

# Shopify
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_SCOPES=read_orders,write_orders,read_products,write_products,read_inventory,write_inventory,read_customers,read_analytics

# Xero
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=

# Auth
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# Encryption
ENCRYPTION_KEY=            # 32-byte hex for AES-256-GCM

# Monitoring
SENTRY_DSN=
```

---

## Conventions

### Code
- TypeScript strict mode everywhere
- Zod for runtime validation, infer types from schemas
- No `any` — use `unknown` + type guards
- Explicit return types on exported functions
- Files: `kebab-case.ts`, Types: `PascalCase`, Functions: `camelCase`
- Database tables: `snake_case`
- Every primitive has exactly 1 file. No sprawl.

### Agent interactions
- Every agent run is logged: messages, primitive calls, results, tokens, latency
- Every write action is logged to an audit table
- Generated files are stored with a 24-hour expiry link
- Conversation history: last 15 messages injected as context
- Business memory: top 20 relevant memory entries injected via embedding similarity

### Error philosophy
- Primitives never throw. They return `{ success: false, error: "human-readable message" }`.
- The agent sees the error and decides how to handle it (retry, try different approach, tell the owner).
- If the agent loop exceeds 25 iterations, force-complete with whatever it has.
- If Claude API is down, send: "I'm having trouble thinking right now. Try again in a minute."

---

## Pricing

| Plan | Price | Limits |
|------|-------|--------|
| Starter | $29/mo | 1 store, 500 agent runs/mo, daily brief |
| Growth | $59/mo | 2 stores, 2000 agent runs/mo, Xero, proactive analysis |
| Pro | $149/mo | Unlimited stores, unlimited runs, priority, team (3 seats) |

14-day free trial on Growth. Billed via Shopify Billing API (App Store) or Stripe (direct).

An "agent run" = one owner message that triggers the agent loop (regardless of how many primitive calls it makes). Simple and easy to explain.
