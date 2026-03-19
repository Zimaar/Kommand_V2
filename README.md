# KOMMAND v2 — Agentic Architecture

## Files

| File | Read When |
|------|-----------|
| `PROJECT_BIBLE.md` | **Every session.** Load as context always. |
| `specs/AGENT_CORE.md` | Building M1 (agent loop, primitives, system prompt, proactive engine) |
| `specs/DATABASE_SCHEMA.md` | Building M0 (database), or anytime you need table structure |
| `specs/SECURITY.md` | Building M2/M3 (OAuth, webhooks), M8 (hardening) |
| `prompts/ALL_PROMPTS.md` | **The build guide.** 34 prompts. Execute in order. |

## Architecture in 30 seconds

Owner sends WhatsApp message → agent reasoning loop (Claude with extended thinking) → agent calls primitives (Shopify API, Xero API, Python code execution, web search, file generation, send comms, memory) in whatever combination it needs → delivers result (text, charts, PDFs, spreadsheets) back via WhatsApp.

No hardcoded tools. No intent matching. No response templates. The agent reasons from primitives.

## Key numbers

- 7 primitives (not 25 tools)
- 34 prompts (not 52)
- ~12 days to build (not 20)
- First end-to-end test: day 4.5
- First "holy shit" moment: day 5.5
