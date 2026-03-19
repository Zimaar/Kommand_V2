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

## M8 — Performance

### E2B pip install on every sandbox run (run-code.ts)
**File:** `apps/api/src/primitives/run-code.ts`

`reportlab openpyxl python-pptx Pillow` are installed via `pip install -q` on every cold sandbox start, adding ~10–20s per run.

**Fix:** Create a custom E2B sandbox template with these packages pre-installed. Reference the template ID in config (`E2B_TEMPLATE_ID`) and pass it to `Sandbox.create({ template: config.E2B_TEMPLATE_ID })`. Falls back to default template if not set.
