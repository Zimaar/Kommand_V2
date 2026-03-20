# Deferred Issues

Issues identified during review that are intentionally deferred — not forgotten.
Address before the relevant milestone ships.

---

## M8.3 Billing

### Clerk JWT auth on billing + dashboard routes
All dashboard and billing routes currently resolve the tenant from `x-tenant-id` header only.
`dashboard.ts` has a comment: "In production: verify Clerk JWT from Authorization header".
Implement proper Clerk JWT verification on all authenticated routes before launch.
**Files:** `apps/api/src/routes/dashboard.ts`, `apps/api/src/routes/billing.ts`

### `processingMs` on async webhooks measures full pipeline time, not HTTP time
`logWebhook` is called after `processInboundMessage` / `handleWebhook` resolves, which includes
the full agent run (potentially minutes). The field name `processingMs` implies HTTP processing
time. Rename to `pipelineMs` or split into `httpMs` + `pipelineMs` when touching webhook logging.
**Files:** `apps/api/src/routes/webhooks.ts`, `apps/api/src/routes/shopify-webhooks.ts`

### `returnUrl` in `createShopifyCharge` includes manual `charge_id` param
Shopify appends `charge_id` automatically on redirect — the manual `returnUrl` construction is misleading but harmless.
Clean up when touching `shopify-billing.ts` next.
**File:** `apps/api/src/billing/shopify-billing.ts:44`

### Pipeline comment numbering — step `6b` with no `6a`
**File:** `apps/api/src/channels/pipeline.ts`

---

## Pre-submission (before Shopify App Store submission)

### Legal review
- **Privacy Policy** (`/privacy`) must be reviewed by legal counsel before submission
- **Terms of Service** (`/terms`) must be reviewed by legal counsel before submission
- Both documents reference England & Wales governing law — confirm this matches the registered entity's jurisdiction
- Referenced in `specs/APP_LISTING.md` checklist under "Before submission"
