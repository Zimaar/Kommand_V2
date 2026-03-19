# AGENT CORE — Technical Spec

This is the brain of Kommand. Everything else is plumbing.

---

## The Agent Loop

```typescript
async function runAgent(
  inboundMessage: string,
  tenantId: string
): Promise<AgentResponse> {
  // 1. Load everything the agent needs to know
  const context = await buildContext(tenantId);
  
  // 2. Build the message array
  const messages = [
    ...context.conversationHistory,  // last 15 messages
    { role: "user", content: inboundMessage }
  ];
  
  // 3. Check: is this a confirmation response to a pending action?
  const pending = await getPendingConfirmation(tenantId);
  if (pending && isConfirmation(inboundMessage)) {
    return await executePendingAction(pending, inboundMessage);
  }
  
  // 4. Run the agent loop
  let iterations = 0;
  const MAX_ITERATIONS = 25;
  
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      thinking: { type: "enabled", budget_tokens: 10000 },
      system: buildSystemPrompt(context),
      tools: getPrimitiveDefinitions(context.connectedPlatforms),
      messages: messages
    });
    
    // Extract text and tool_use blocks
    const textBlocks = response.content.filter(b => b.type === "text");
    const toolBlocks = response.content.filter(b => b.type === "tool_use");
    
    // If no tool calls, we're done — the agent has its final answer
    if (toolBlocks.length === 0) {
      const finalText = textBlocks.map(b => b.text).join("\n");
      return {
        text: finalText,
        iterations,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        primitivesCalled: collectPrimitiveLog(messages)
      };
    }
    
    // Execute all tool calls (parallel where possible)
    const toolResults = await Promise.all(
      toolBlocks.map(async (block) => {
        const result = await executePrimitive(
          block.name,
          block.input,
          tenantId
        );
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result)
        };
      })
    );
    
    // Append assistant response + tool results to conversation
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }
  
  // Safety: if we hit max iterations, ask the agent to wrap up
  messages.push({
    role: "user",
    content: "You've used many steps. Please summarize what you've found so far and deliver your best answer to the owner now."
  });
  
  const finalResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system: buildSystemPrompt(context),
    messages: messages
  });
  
  return {
    text: finalResponse.content.filter(b => b.type === "text").map(b => b.text).join("\n"),
    iterations,
    tokensUsed: totalTokens,
    primitivesCalled: collectPrimitiveLog(messages)
  };
}
```

---

## Context Builder

Before every agent run, we assemble the full business context:

```typescript
async function buildContext(tenantId: string): Promise<AgentContext> {
  const [tenant, stores, connections, history, memories] = await Promise.all([
    getTenant(tenantId),
    getStores(tenantId),
    getAccountingConnections(tenantId),
    getConversationHistory(tenantId, 15),
    getRelevantMemories(tenantId, 20)  // top 20 by embedding similarity
  ]);

  return {
    tenant,               // name, timezone, preferences, plan
    stores,               // connected Shopify/WooCommerce stores
    connections,          // connected Xero/QB accounts
    connectedPlatforms,   // which primitives are available
    conversationHistory,  // last 15 messages formatted for Claude
    businessMemory,       // relevant memory entries as text
    currentTime           // in tenant's timezone
  };
}
```

The system prompt is templated with this context:

```typescript
function buildSystemPrompt(ctx: AgentContext): string {
  return `${AGENT_PERSONA}

## Your owner
- Name: ${ctx.tenant.name}
- Store: ${ctx.stores.map(s => `${s.shopName} on ${s.platform}`).join(", ")}
- Currency: ${ctx.stores[0]?.currency || "USD"}
- Timezone: ${ctx.tenant.timezone}
- Current time: ${formatInTimezone(new Date(), ctx.tenant.timezone)}
- Plan: ${ctx.tenant.plan}

## Connected platforms
${ctx.connectedPlatforms.map(p => `- ${p}`).join("\n")}
${ctx.connectedPlatforms.length === 0 ? "- No platforms connected yet. Help the owner set up." : ""}

## Business memory
What you know about this business from previous interactions:
${ctx.businessMemory.length > 0 ? ctx.businessMemory.map(m => `- ${m.content}`).join("\n") : "No memories yet. Start building knowledge as you interact."}

## Active alerts
${ctx.pendingAlerts?.map(a => `- ${a.message}`).join("\n") || "None"}`;
}
```

---

## Primitive Definitions (Claude Tool Format)

Each primitive is defined as a Claude tool. The key difference from the old architecture: the agent controls what data to request, what code to write, what to search for. The primitive just executes.

### shopify_api

```json
{
  "name": "shopify_api",
  "description": "Execute a Shopify Admin API request against the owner's store. You can run any GraphQL query or mutation, or any REST API call. Use this to read orders, products, customers, inventory, analytics — and to create refunds, discounts, fulfillments, or any other write operation. You write the query. Shopify API version: 2024-10.",
  "input_schema": {
    "type": "object",
    "properties": {
      "method": {
        "type": "string",
        "enum": ["graphql", "rest_get", "rest_post", "rest_put", "rest_delete"],
        "description": "Use graphql for most operations. Use rest_* only for endpoints not available in GraphQL."
      },
      "query": {
        "type": "string",
        "description": "For graphql: the full GraphQL query or mutation string. For rest_*: the API path (e.g., '/orders/12345.json')."
      },
      "variables": {
        "type": "object",
        "description": "GraphQL variables, or REST request body for POST/PUT."
      }
    },
    "required": ["method", "query"]
  }
}
```

Implementation: decrypt the tenant's Shopify token, proxy the request, return the response. That's it. No business logic in the primitive.

### xero_api

```json
{
  "name": "xero_api",
  "description": "Execute a Xero API request against the owner's accounting org. You construct the endpoint path and request body. Use this for invoices, bills, contacts, bank transactions, reports (P&L, balance sheet, aged receivables), and any other Xero operation. Base URL is https://api.xero.com/api.xro/2.0/. You provide the path after that.",
  "input_schema": {
    "type": "object",
    "properties": {
      "method": {
        "type": "string",
        "enum": ["GET", "POST", "PUT", "DELETE"]
      },
      "path": {
        "type": "string",
        "description": "API path after /api.xro/2.0/ — e.g., 'Invoices', 'Invoices?where=Status==\"OVERDUE\"', 'Reports/ProfitAndLoss'"
      },
      "body": {
        "type": "object",
        "description": "Request body for POST/PUT operations."
      }
    },
    "required": ["method", "path"]
  }
}
```

### run_code

```json
{
  "name": "run_code",
  "description": "Execute Python code in a sandboxed environment. Pre-installed packages: pandas, numpy, matplotlib, seaborn, reportlab, openpyxl, python-pptx, Pillow, scipy, scikit-learn, requests. Use this for ALL data analysis, chart generation, computations, forecasting, and report building. The code runs in an isolated container. You can write files to /tmp/ and they will be available for download. Return data by printing to stdout. For charts, save to /tmp/chart.png. For reports, save to /tmp/report.pdf.",
  "input_schema": {
    "type": "object",
    "properties": {
      "code": {
        "type": "string",
        "description": "Python code to execute. Print results to stdout. Save files to /tmp/."
      }
    },
    "required": ["code"]
  }
}
```

Implementation: send code to E2B API, get back stdout + list of files in /tmp/. Upload any generated files to Supabase Storage. Return stdout + file download URLs.

### web_search

```json
{
  "name": "web_search",
  "description": "Search the web or fetch a specific URL. Use for: competitor research, finding product images, checking market prices, looking up shipping rates, finding supplier info, or any question that needs current internet data.",
  "input_schema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["search", "fetch_url"]
      },
      "query": {
        "type": "string",
        "description": "For search: the search query. For fetch_url: the full URL to fetch."
      }
    },
    "required": ["action", "query"]
  }
}
```

Implementation: for search, use Serper API or Brave Search API. For fetch, use a headless fetch with readability extraction.

### generate_file

This is actually handled by `run_code` — the agent writes Python to generate the file, saves to /tmp/, and the system uploads it. But we expose this as a separate "conceptual" primitive in the system prompt to make it clear the agent CAN generate files. In practice, calling `generate_file` is equivalent to calling `run_code` with file-generation code.

Alternatively, for simple cases, we can have a thin wrapper:

```json
{
  "name": "generate_file",
  "description": "Generate a downloadable file. For complex files (PDF reports, PPTX decks, XLSX spreadsheets with charts), use run_code instead and save to /tmp/. This primitive is for simple text/CSV/JSON file generation.",
  "input_schema": {
    "type": "object",
    "properties": {
      "filename": { "type": "string" },
      "content": { "type": "string" },
      "content_type": {
        "type": "string",
        "enum": ["text/plain", "text/csv", "application/json", "text/markdown"]
      }
    },
    "required": ["filename", "content"]
  }
}
```

### send_comms

```json
{
  "name": "send_comms",
  "description": "Send a message to someone on the owner's behalf. This could be a WhatsApp message to a customer, an email to a supplier, or an invoice reminder. IMPORTANT: You MUST show the owner a preview of the message and get their explicit confirmation before calling this primitive. Never send without approval.",
  "input_schema": {
    "type": "object",
    "properties": {
      "channel": {
        "type": "string",
        "enum": ["whatsapp", "email"]
      },
      "to": {
        "type": "string",
        "description": "Phone number (E.164) for WhatsApp, email address for email."
      },
      "subject": {
        "type": "string",
        "description": "Email subject line. Not used for WhatsApp."
      },
      "body": {
        "type": "string",
        "description": "Message body."
      }
    },
    "required": ["channel", "to", "body"]
  }
}
```

### memory

```json
{
  "name": "memory",
  "description": "Read from or write to the business knowledge store. Use 'read' to search for relevant past observations, owner preferences, supplier info, seasonal patterns, or any previously stored knowledge. Use 'write' to store new observations about the business that will be useful in future interactions. Examples of what to remember: 'Owner prefers conservative pricing', 'Peak season is Nov-Dec', 'Main supplier is Al Noor Textiles, contact: ahmed@alnoor.ae', 'Average daily orders: 12-15', 'Owner wants weekly P&L summary every Monday'.",
  "input_schema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["read", "write"]
      },
      "query": {
        "type": "string",
        "description": "For read: natural language search query to find relevant memories. For write: the observation or fact to store."
      },
      "category": {
        "type": "string",
        "enum": ["preference", "pattern", "contact", "decision", "observation", "workflow"],
        "description": "Category of the memory being stored. Only used for write."
      }
    },
    "required": ["action", "query"]
  }
}
```

Implementation: uses pgvector. On write, embed the text and store with metadata. On read, embed the query and do similarity search, return top N results.

---

## Confirmation Handling

The agent handles confirmations conversationally, not via a state machine:

1. Agent decides an action needs confirmation
2. Agent responds with a preview + WhatsApp buttons (Yes / No / Edit)
3. The preview message and intended action are stored in `pending_actions` table
4. When the owner replies, the ingestion pipeline checks for pending actions first
5. If "Yes" → execute the stored action, tell the owner the result
6. If "No" → cancel, acknowledge
7. If anything else → feed it to the agent with context: "Owner was asked to confirm X and replied: {reply}"
8. Pending actions expire after 10 minutes

This is simpler than the old tier system and more flexible — the agent decides how much detail to show in the preview based on the risk of the action.

---

## Proactive Analysis

Instead of fixed threshold alerts, the agent runs periodic analysis:

```typescript
// Runs every 6 hours per tenant (staggered)
async function runProactiveAnalysis(tenantId: string): Promise<void> {
  const context = await buildContext(tenantId);
  
  const analysisPrompt = `You are running a periodic business health check for ${context.tenant.name}.

Pull the key metrics from the last 24 hours and compare against:
1. The same period last week
2. The trailing 30-day average

Look for anything notable:
- Revenue or order count significantly above or below normal
- Inventory items approaching stockout
- Overdue invoices that need follow-up
- Unusual patterns (spike in returns, change in AOV, new high-value customer)
- Anything else that a good COO would flag

If you find something worth reporting, compose a concise message to the owner.
If nothing notable, respond with "NO_ALERT" and nothing else.

Store any new patterns or observations in memory for future reference.`;

  const result = await runAgent(analysisPrompt, tenantId);
  
  if (!result.text.includes("NO_ALERT")) {
    await sendToOwner(tenantId, result.text);
  }
}
```

The morning brief works the same way — a scheduled agent run with a specific prompt:

```typescript
async function runMorningBrief(tenantId: string): Promise<void> {
  const briefPrompt = `Generate the morning business brief for ${context.tenant.name}.

Pull yesterday's data and overnight activity. Include:
- Revenue and order summary vs typical day
- Any orders or payments needing attention
- Inventory alerts
- Cash position and overdue invoices (if Xero connected)
- What to focus on today

Keep it under 300 words. Format for WhatsApp mobile reading.`;

  const result = await runAgent(briefPrompt, tenantId);
  await sendToOwner(tenantId, result.text);
}
```

This is radically simpler than the old M6 with its alert rules, threshold configs, and template system. The agent IS the analysis engine.

---

## Token Budget Management

Agent runs can get expensive if unchecked. Strategy:

| Plan | Max tokens per run | Max runs per day | Thinking budget |
|------|-------------------|------------------|-----------------|
| Starter | 30K total | ~17 | 5K |
| Growth | 60K total | ~67 | 10K |
| Pro | 100K total | unlimited | 15K |

Per-run token tracking:
- Each Claude API call's usage is accumulated
- If total tokens for the run exceed the plan limit, force-complete on next iteration
- Dashboard shows token usage so owners understand their consumption

Cost estimate at scale:
- Average agent run: ~8K tokens input, ~2K output ≈ $0.03 per run
- Heavy run (report generation): ~30K tokens ≈ $0.12 per run
- Morning brief: ~15K tokens ≈ $0.06 per run
- 500 merchants × 20 runs/day average = 10K runs/day ≈ $300/day in AI costs
- Revenue at that scale: 500 × $45 avg/mo ≈ $22.5K/mo → ~$750/day
- AI cost ratio: ~40% — healthy for an AI-native product
