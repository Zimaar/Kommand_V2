# Deferred Issues

Issues identified during code review that are intentionally deferred to a later milestone.
Fix before launch (M8) unless noted otherwise.

---

## M8 — Security Hardening

### SSRF protection on `fetchUrl` (web-search.ts)
**File:** `apps/api/src/primitives/web-search.ts`

`fetchUrl` accepts any URL and `fetch()` will follow redirects without restriction. A malicious prompt could instruct the agent to fetch internal endpoints (e.g. `http://localhost:3000/...`) or cloud metadata services (e.g. `http://169.254.169.254/latest/meta-data/`).

**Fix:** Before fetching, resolve the hostname and block:
- Loopback: `127.x.x.x`, `::1`
- Private ranges: `10.x`, `172.16–31.x`, `192.168.x`
- Link-local: `169.254.x.x` (AWS/GCP metadata)
- Unresolvable hostnames

Risk at current stage is low (owner-controlled agent, no untrusted user input), but must be hardened before public launch.

---

## Dashboard button (future) — runMorningBrief silent non-delivery

### `runMorningBrief` doesn't indicate skipped WhatsApp delivery to caller
**File:** `apps/api/src/proactive/scheduler.ts`

When `getAdapter("whatsapp")` returns `null`, the brief is generated (tokens spent) but silently not delivered. The function returns the text with no signal that delivery was skipped. For the scheduler this is harmless, but when the "Send brief now" dashboard button is wired up the caller will see a success response while the owner receives nothing.

**Fix:** Return `{ text, delivered: boolean }` or throw if adapter is null when called from a manual trigger context. Alternatively accept an `options.send = true` flag so the caller controls delivery.

---

## M8 — Performance

### `test-morning-brief.ts` env defaults run after imports
**File:** `scripts/test-morning-brief.ts`

The `process.env["DATABASE_URL"] ??=` / `REDIS_URL` / `ENCRYPTION_KEY` defaults at lines 20-22 are module body statements. ES module static imports are hoisted, so `scheduler.ts` (and its Redis/DB init) resolves before those defaults are applied. In practice this only affects runs with no `.env` file, which aren't a supported use case for this script.

**Fix:** Move the defaults to a separate `scripts/env-defaults.ts` file and import it first, or switch to dynamic `import()` for `runMorningBrief` after the defaults are set.

---

### E2B pip install on every sandbox run (run-code.ts)
**File:** `apps/api/src/primitives/run-code.ts`

`reportlab openpyxl python-pptx Pillow` are installed via `pip install -q` on every cold sandbox start, adding ~10–20s per run.

**Fix:** Create a custom E2B sandbox template with these packages pre-installed. Reference the template ID in config (`E2B_TEMPLATE_ID`) and pass it to `Sandbox.create({ template: config.E2B_TEMPLATE_ID })`. Falls back to default template if not set.
