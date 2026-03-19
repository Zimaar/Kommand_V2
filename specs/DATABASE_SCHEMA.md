# DATABASE SCHEMA — v2

PostgreSQL 16 via Supabase. ORM: Drizzle. pgvector extension for memory embeddings.

---

## Tables

### tenants
```sql
tenants
├── id              UUID PK DEFAULT gen_random_uuid()
├── clerk_id        TEXT UNIQUE NOT NULL
├── email           TEXT UNIQUE NOT NULL
├── name            TEXT
├── phone           TEXT                        -- E.164 WhatsApp number
├── timezone        TEXT DEFAULT 'UTC'
├── currency        TEXT DEFAULT 'USD'
├── plan            TEXT DEFAULT 'trial'         -- trial|starter|growth|pro
├── plan_expires_at TIMESTAMPTZ
├── preferences     JSONB DEFAULT '{}'           -- morning_brief_time, quiet_hours, etc.
├── created_at      TIMESTAMPTZ DEFAULT now()
└── updated_at      TIMESTAMPTZ DEFAULT now()
```

### stores
```sql
stores
├── id              UUID PK DEFAULT gen_random_uuid()
├── tenant_id       UUID NOT NULL → tenants(id) CASCADE
├── platform        TEXT NOT NULL               -- shopify|woocommerce
├── domain          TEXT NOT NULL               -- mystore.myshopify.com
├── name            TEXT
├── access_token_enc TEXT NOT NULL              -- AES-256-GCM encrypted
├── token_iv        TEXT NOT NULL
├── token_tag       TEXT NOT NULL
├── scopes          TEXT[]
├── is_active       BOOLEAN DEFAULT true
├── created_at      TIMESTAMPTZ DEFAULT now()
└── updated_at      TIMESTAMPTZ DEFAULT now()
UNIQUE(tenant_id, platform, domain)
INDEX(tenant_id)
```

### accounting_connections
```sql
accounting_connections
├── id              UUID PK DEFAULT gen_random_uuid()
├── tenant_id       UUID NOT NULL → tenants(id) CASCADE
├── platform        TEXT NOT NULL               -- xero|quickbooks
├── org_id          TEXT                        -- Xero tenant ID / QB realm ID
├── org_name        TEXT
├── access_token_enc TEXT NOT NULL
├── refresh_token_enc TEXT NOT NULL
├── token_iv        TEXT NOT NULL
├── token_tag       TEXT NOT NULL
├── token_expires_at TIMESTAMPTZ
├── is_active       BOOLEAN DEFAULT true
├── created_at      TIMESTAMPTZ DEFAULT now()
└── updated_at      TIMESTAMPTZ DEFAULT now()
UNIQUE(tenant_id, platform, org_id)
INDEX(tenant_id)
```

### channels
```sql
channels
├── id              UUID PK DEFAULT gen_random_uuid()
├── tenant_id       UUID NOT NULL → tenants(id) CASCADE
├── type            TEXT NOT NULL               -- whatsapp|slack|email
├── identifier      TEXT NOT NULL               -- phone number / channel ID
├── is_active       BOOLEAN DEFAULT true
├── created_at      TIMESTAMPTZ DEFAULT now()
UNIQUE(tenant_id, type, identifier)
INDEX(type, identifier)                         -- lookup by incoming message
```

### messages
The conversation log. Every message between owner and agent.
```sql
messages
├── id              UUID PK DEFAULT gen_random_uuid()
├── tenant_id       UUID NOT NULL → tenants(id) CASCADE
├── direction       TEXT NOT NULL               -- inbound|outbound
├── role            TEXT NOT NULL               -- user|assistant|system
├── content         TEXT NOT NULL
├── channel_msg_id  TEXT                        -- WhatsApp message ID for dedup
├── agent_run_id    UUID                        -- links to the agent run that produced this
├── created_at      TIMESTAMPTZ DEFAULT now()
INDEX(tenant_id, created_at DESC)
UNIQUE(channel_msg_id) WHERE channel_msg_id IS NOT NULL
```

### agent_runs
Every time the agent loop executes. The core audit log.
```sql
agent_runs
├── id              UUID PK DEFAULT gen_random_uuid()
├── tenant_id       UUID NOT NULL → tenants(id) CASCADE
├── trigger         TEXT NOT NULL               -- message|morning_brief|proactive|scheduled
├── input           TEXT NOT NULL               -- the triggering message or prompt
├── output          TEXT                        -- final response text
├── iterations      INTEGER                     -- how many loop iterations
├── primitive_calls JSONB                       -- array of {name, input_summary, success, latency_ms}
├── tokens_input    INTEGER
├── tokens_output   INTEGER
├── latency_ms      INTEGER
├── status          TEXT DEFAULT 'running'      -- running|completed|failed|timeout
├── error           TEXT
├── created_at      TIMESTAMPTZ DEFAULT now()
INDEX(tenant_id, created_at DESC)
INDEX(status) WHERE status = 'running'
```

### pending_actions
Commands waiting for owner confirmation.
```sql
pending_actions
├── id              UUID PK DEFAULT gen_random_uuid()
├── tenant_id       UUID NOT NULL → tenants(id) CASCADE
├── agent_run_id    UUID → agent_runs(id)
├── action_type     TEXT NOT NULL               -- refund|cancel|send_invoice|send_comms|update_price|etc.
├── primitive_name  TEXT NOT NULL
├── primitive_input JSONB NOT NULL              -- the exact primitive call to execute if confirmed
├── preview_text    TEXT NOT NULL               -- what the owner saw
├── status          TEXT DEFAULT 'pending'      -- pending|confirmed|cancelled|expired
├── expires_at      TIMESTAMPTZ NOT NULL
├── resolved_at     TIMESTAMPTZ
├── created_at      TIMESTAMPTZ DEFAULT now()
INDEX(tenant_id) WHERE status = 'pending'
```

### memories
Business knowledge store with vector embeddings.
```sql
-- REQUIRES: CREATE EXTENSION vector;
memories
├── id              UUID PK DEFAULT gen_random_uuid()
├── tenant_id       UUID NOT NULL → tenants(id) CASCADE
├── content         TEXT NOT NULL               -- the observation/fact/preference
├── category        TEXT NOT NULL               -- preference|pattern|contact|decision|observation|workflow
├── embedding       vector(1536)                -- text-embedding-3-small
├── source_run_id   UUID                        -- which agent run created this
├── is_active       BOOLEAN DEFAULT true
├── created_at      TIMESTAMPTZ DEFAULT now()
INDEX USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100)
INDEX(tenant_id, category)
```

### scheduled_jobs
Recurring agent runs (morning brief, proactive analysis).
```sql
scheduled_jobs
├── id              UUID PK DEFAULT gen_random_uuid()
├── tenant_id       UUID NOT NULL → tenants(id) CASCADE
├── job_type        TEXT NOT NULL               -- morning_brief|proactive_analysis|custom
├── prompt          TEXT NOT NULL               -- the prompt to feed the agent
├── cron            TEXT NOT NULL               -- cron expression
├── is_active       BOOLEAN DEFAULT true
├── last_run_at     TIMESTAMPTZ
├── next_run_at     TIMESTAMPTZ
├── created_at      TIMESTAMPTZ DEFAULT now()
INDEX(next_run_at) WHERE is_active = true
```

### generated_files
Files created by the agent, stored in Supabase Storage.
```sql
generated_files
├── id              UUID PK DEFAULT gen_random_uuid()
├── tenant_id       UUID NOT NULL → tenants(id) CASCADE
├── agent_run_id    UUID → agent_runs(id)
├── filename        TEXT NOT NULL
├── storage_path    TEXT NOT NULL               -- Supabase Storage path
├── download_url    TEXT NOT NULL               -- signed URL (24hr expiry)
├── content_type    TEXT NOT NULL
├── size_bytes      INTEGER
├── expires_at      TIMESTAMPTZ NOT NULL
├── created_at      TIMESTAMPTZ DEFAULT now()
INDEX(tenant_id, created_at DESC)
```

---

## Key Differences From v1

1. **No `commands` table.** The old design logged every "tool call" as a command. Now `agent_runs` captures the full execution trace in its `primitive_calls` JSONB column. One agent run may involve 15 primitive calls — they're all in one row.

2. **No `conversations` table.** Conversations are just sequences of messages for a tenant. No need for a separate conversation entity — the tenant IS the conversation.

3. **`memories` with vector embeddings.** This is new. The agent builds persistent knowledge about the business that persists across conversations and gets injected as context.

4. **`generated_files` table.** Tracks every file the agent creates so we can manage storage and expiry.

5. **`pending_actions` replaces `pending_confirmations`.** Simpler — stores the exact primitive call to replay if confirmed.

6. **`agent_runs` is the core audit table.** Every interaction, every proactive run, every scheduled job — all traced.

---

## Security

Same as v1: AES-256-GCM encryption for all OAuth tokens, webhook signature verification, tenant isolation enforced at primitive layer. See specs/SECURITY.md.

The additional concern: `run_code` executes arbitrary Python. E2B sandboxes handle this — the code runs in an isolated container with no network access to our infrastructure, no access to other tenants' data, and a 30-second timeout. The agent passes data INTO the sandbox via the code string (embedded as variables or JSON), not via shared filesystem.
