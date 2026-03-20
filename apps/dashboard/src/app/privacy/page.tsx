import type { Metadata } from "next";
import Link from "next/link";
import { LegalNav, LegalSection, LegalFooter } from "@/components/legal";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacy Policy — Kommand",
  description: "How Kommand collects, stores, and protects your data.",
};

export default function PrivacyPolicyPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LegalNav />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-gray-400 text-sm mb-12">Last updated: 20 March 2026</p>

        <div className="prose-kommand">
          <LegalSection title="1. Who we are">
            <p>
              Kommand (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a software-as-a-service product that
              provides an autonomous AI agent for small business operations, distributed via the Shopify App Store.
              This policy explains how we collect, use, store, and protect your data when you use Kommand.
            </p>
          </LegalSection>

          <LegalSection title="2. Data we collect">
            <h4 className="font-semibold text-gray-900 mt-4 mb-2">Account data</h4>
            <p>
              When you sign up we collect your name, email address, and authentication credentials via our
              identity provider (Clerk). We also store your timezone, currency preference, and plan tier.
            </p>

            <h4 className="font-semibold text-gray-900 mt-4 mb-2">Shopify store data</h4>
            <p>
              When you connect your Shopify store via OAuth, we receive a scoped API access token. Through
              that token the Kommand agent accesses orders, products, customers, inventory, and analytics
              <strong> on demand</strong> — we do not bulk-sync or permanently store copies of your Shopify data.
              Data is fetched in real time to answer your questions, then discarded after the agent run completes.
            </p>

            <h4 className="font-semibold text-gray-900 mt-4 mb-2">Xero accounting data</h4>
            <p>
              Similarly, when you connect Xero we receive an OAuth 2.0 access &amp; refresh token pair. The
              agent accesses invoices, bills, contacts, reports, and bank transactions on demand. No bulk
              copies are stored.
            </p>

            <h4 className="font-semibold text-gray-900 mt-4 mb-2">WhatsApp messages</h4>
            <p>
              Inbound messages you send via WhatsApp and the agent&rsquo;s outbound responses are stored as
              conversation history. We retain the most recent 15 messages as active context; older messages
              are stored in our database for audit and continuity.
            </p>

            <h4 className="font-semibold text-gray-900 mt-4 mb-2">Business memory</h4>
            <p>
              The agent writes observations, patterns, and preferences to a business knowledge store
              (e.g. &ldquo;Peak season is November&rdquo;, &ldquo;Supplier X lead time is 3 weeks&rdquo;). These
              memories are stored as text with vector embeddings for retrieval. You can view and delete
              individual memories from the dashboard at any time.
            </p>

            <h4 className="font-semibold text-gray-900 mt-4 mb-2">Agent run logs</h4>
            <p>
              Every agent interaction is logged: your input message, the agent&rsquo;s output, which
              primitives were called (with summarised inputs), token usage, and latency.
              Logs are retained for 90 days and cannot be modified.
            </p>

            <h4 className="font-semibold text-gray-900 mt-4 mb-2">Generated files</h4>
            <p>
              When the agent creates files (PDFs, spreadsheets, charts), they are uploaded to cloud storage
              with download links that <strong>expire after 24 hours</strong>.
            </p>
          </LegalSection>

          <LegalSection title="3. How we store and protect your data">
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                <strong>Database:</strong> PostgreSQL 16 hosted on Supabase with encryption at rest and TLS
                in transit. All data is tenant-isolated — every query is scoped to your account.
              </li>
              <li>
                <strong>OAuth tokens:</strong> Encrypted at rest using <strong>AES-256-GCM</strong> with
                unique initialisation vectors per token. Tokens are decrypted only at the moment of API
                call, never logged, and never exposed to the AI agent.
              </li>
              <li>
                <strong>Code execution:</strong> When the agent runs Python code (for data analysis or file
                generation), it executes in an isolated, disposable sandbox hosted by E2B. The sandbox has
                no access to your credentials, our database, or any other tenant&rsquo;s data. Each sandbox
                is destroyed after use.
              </li>
              <li>
                <strong>Webhook verification:</strong> All inbound webhooks (WhatsApp, Shopify) are verified
                via HMAC-SHA256 signature checks using timing-safe comparison to prevent forgery.
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="4. Third-party services">
            <p>We use the following sub-processors to deliver the service:</p>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-600">
                    <th className="px-4 py-2.5 font-semibold">Provider</th>
                    <th className="px-4 py-2.5 font-semibold">Purpose</th>
                    <th className="px-4 py-2.5 font-semibold">Data shared</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr><td className="px-4 py-2.5">Anthropic</td><td className="px-4 py-2.5">AI reasoning (Claude API)</td><td className="px-4 py-2.5">Conversation context, business data summaries</td></tr>
                  <tr><td className="px-4 py-2.5">E2B</td><td className="px-4 py-2.5">Sandboxed code execution</td><td className="px-4 py-2.5">Python code + data passed in by the agent</td></tr>
                  <tr><td className="px-4 py-2.5">Supabase</td><td className="px-4 py-2.5">Database + file storage</td><td className="px-4 py-2.5">All persistent data</td></tr>
                  <tr><td className="px-4 py-2.5">Meta (WhatsApp Cloud API)</td><td className="px-4 py-2.5">Messaging channel</td><td className="px-4 py-2.5">Messages between you and the agent</td></tr>
                  <tr><td className="px-4 py-2.5">Clerk</td><td className="px-4 py-2.5">Authentication</td><td className="px-4 py-2.5">Email, name, auth credentials</td></tr>
                  <tr><td className="px-4 py-2.5">Railway</td><td className="px-4 py-2.5">API hosting</td><td className="px-4 py-2.5">Application runtime</td></tr>
                  <tr><td className="px-4 py-2.5">Sentry</td><td className="px-4 py-2.5">Error monitoring</td><td className="px-4 py-2.5">Error stack traces (no business data)</td></tr>
                </tbody>
              </table>
            </div>
          </LegalSection>

          <LegalSection title="5. Your rights (GDPR)">
            <p>If you are in the EU/EEA or the UK, you have the following rights:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Access:</strong> Request a copy of all data we hold about you.</li>
              <li><strong>Export:</strong> Download your data as JSON from the dashboard.</li>
              <li><strong>Rectification:</strong> Correct inaccurate data via the dashboard or by contacting us.</li>
              <li><strong>Erasure:</strong> Delete your account and all associated data. This cascading delete removes your
                stores, tokens, conversations, memories, agent logs, and generated files. OAuth tokens for
                connected services (Shopify, Xero) are revoked.</li>
              <li><strong>Restriction &amp; objection:</strong> Contact us to restrict or object to specific processing.</li>
              <li><strong>Portability:</strong> Your data export is in standard JSON format.</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email <strong>privacy@kommand.dev</strong> or use the
              self-service options in the dashboard under <strong>Settings</strong>.
            </p>
          </LegalSection>

          <LegalSection title="6. Shopify GDPR compliance">
            <p>
              As a Shopify app, we implement the three mandatory GDPR webhooks:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Customer data request:</strong> We compile and return all data associated with the specified customer.</li>
              <li><strong>Customer data erasure:</strong> We delete all records associated with the specified customer.</li>
              <li><strong>Shop data erasure:</strong> When you uninstall Kommand, we delete all data associated with your store within 48 hours.</li>
            </ul>
          </LegalSection>

          <LegalSection title="7. Data retention">
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Generated files: <strong>24 hours</strong> (auto-expired download links)</li>
              <li>Agent run logs: <strong>90 days</strong></li>
              <li>Conversation history: retained while your account is active</li>
              <li>Business memories: retained while your account is active (individually deletable)</li>
              <li>On account deletion: all data is permanently removed within 48 hours</li>
            </ul>
          </LegalSection>

          <LegalSection title="8. Cookies">
            <p>
              The Kommand dashboard uses essential cookies for authentication (session management via Clerk).
              We do not use tracking, advertising, or analytics cookies.
            </p>
          </LegalSection>

          <LegalSection title="9. Changes to this policy">
            <p>
              We may update this policy from time to time. Material changes will be communicated via the
              dashboard and/or email. Continued use of Kommand after changes constitutes acceptance.
            </p>
          </LegalSection>

          <LegalSection title="10. Contact">
            <p>
              For privacy questions or data requests, contact us at{" "}
              <strong>privacy@kommand.dev</strong>.
            </p>
          </LegalSection>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
