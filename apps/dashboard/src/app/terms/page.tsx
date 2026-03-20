import type { Metadata } from "next";
import Link from "next/link";
import { LegalNav, LegalSection, LegalFooter } from "@/components/legal";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms of Service — Kommand",
  description: "Terms governing your use of the Kommand platform.",
};

export default function TermsPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LegalNav />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-gray-400 text-sm mb-12">Last updated: 20 March 2026</p>

        <div className="prose-kommand">
          <LegalSection title="1. Agreement">
            <p>
              By creating an account or using Kommand (&ldquo;the Service&rdquo;), you agree to these Terms
              of Service (&ldquo;Terms&rdquo;). If you are using the Service on behalf of a business, you
              represent that you have authority to bind that entity to these Terms.
            </p>
          </LegalSection>

          <LegalSection title="2. Service description">
            <p>
              Kommand is an autonomous AI agent that helps small business owners manage operations through
              WhatsApp. The agent connects to your Shopify store, Xero accounting, and other services via
              OAuth, and uses AI reasoning to answer questions, execute tasks, generate reports, and
              surface insights about your business.
            </p>
            <p>
              The Service is provided &ldquo;as is&rdquo;. While the agent strives for accuracy, AI-generated
              outputs (analysis, recommendations, generated files) should be reviewed before acting on them.
              You remain responsible for all business decisions.
            </p>
          </LegalSection>

          <LegalSection title="3. Accounts and access">
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>You must provide accurate information when creating an account.</li>
              <li>You are responsible for maintaining the security of your account credentials.</li>
              <li>You must be at least 18 years old to use the Service.</li>
              <li>One account per business entity. Multiple team seats are available on the Pro plan.</li>
            </ul>
          </LegalSection>

          <LegalSection title="4. Shopify App Store">
            <p>
              Kommand is distributed via the Shopify App Store. Your use of Kommand is also subject to
              the{" "}
              <Link href="https://www.shopify.com/legal/terms" className="text-[#534AB7] hover:underline">
                Shopify Terms of Service
              </Link>{" "}
              and the Shopify API License and Terms of Use. In the event of conflict between these Terms
              and Shopify&rsquo;s terms, Shopify&rsquo;s terms prevail for matters relating to the Shopify platform.
            </p>
          </LegalSection>

          <LegalSection title="5. Billing and plans">
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Kommand offers a <strong>14-day free trial</strong> on all plans. No credit card is required to start.</li>
              <li>After the trial, billing is monthly via Shopify Billing API or Stripe (for direct sign-ups).</li>
              <li>
                Plans differ by number of stores, agent runs per month, and features. Current plans:
                Starter ($29/mo), Growth ($59/mo), Pro ($149/mo).
              </li>
              <li>We may change pricing with 30 days&rsquo; notice. Existing subscriptions are honoured until renewal.</li>
              <li>An &ldquo;agent run&rdquo; is one inbound message that triggers the agent loop, regardless of
                how many tool calls the agent makes internally.</li>
            </ul>
          </LegalSection>

          <LegalSection title="6. Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Use the Service for any unlawful purpose or to violate any applicable laws.</li>
              <li>Attempt to manipulate the AI agent via prompt injection, jailbreaking, or similar techniques.</li>
              <li>Use the agent to send spam, phishing, or unsolicited messages to third parties.</li>
              <li>Reverse-engineer, decompile, or attempt to extract the source code of the Service.</li>
              <li>Exceed your plan&rsquo;s usage limits through automated means or circumvention.</li>
              <li>Resell, sublicense, or provide the Service to third parties without our written consent.</li>
            </ul>
          </LegalSection>

          <LegalSection title="7. Data and privacy">
            <p>
              Our handling of your data is governed by our{" "}
              <Link href="/privacy" className="text-[#534AB7] hover:underline">
                Privacy Policy
              </Link>
              , which is incorporated into these Terms by reference. By using the Service, you consent to
              the data practices described in the Privacy Policy.
            </p>
          </LegalSection>

          <LegalSection title="8. Intellectual property">
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                <strong>Your data:</strong> You retain all rights to your business data. We claim no
                ownership over your Shopify data, Xero data, conversations, or generated files.
              </li>
              <li>
                <strong>Our service:</strong> Kommand, its agent logic, system prompts, and platform code
                are our intellectual property. These Terms grant you a limited, non-exclusive,
                non-transferable licence to use the Service for your business operations.
              </li>
              <li>
                <strong>Generated content:</strong> Files, reports, and analysis produced by the agent
                using your data belong to you. We retain no rights to agent outputs.
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="9. Limitations and disclaimers">
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                The Service uses AI to generate analysis, recommendations, and actions. AI outputs may
                contain errors. You should verify critical information before making business decisions.
              </li>
              <li>
                We are not liable for losses arising from actions taken based on AI-generated outputs,
                including incorrect data analysis, erroneous recommendations, or unintended transactions.
              </li>
              <li>
                Our total liability for any claim arising from these Terms or the Service is limited to
                the amount you paid us in the 12 months preceding the claim.
              </li>
              <li>
                We do not guarantee uninterrupted service. Planned maintenance windows will be communicated
                in advance where possible.
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="10. Termination">
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>You may cancel your subscription and delete your account at any time from the dashboard.</li>
              <li>
                We may suspend or terminate your account if you violate these Terms, with notice where
                practicable.
              </li>
              <li>
                On termination, we delete all your data within 48 hours as described in our Privacy Policy.
                OAuth tokens for connected services are revoked.
              </li>
              <li>Sections that should survive termination (liability, IP, disputes) survive.</li>
            </ul>
          </LegalSection>

          <LegalSection title="11. Changes to these Terms">
            <p>
              We may update these Terms from time to time. Material changes will be communicated via the
              dashboard and/or email at least 30 days before taking effect. Continued use of the Service
              after changes take effect constitutes acceptance.
            </p>
          </LegalSection>

          <LegalSection title="12. Governing law">
            <p>
              These Terms are governed by the laws of England and Wales. Disputes will be resolved in the
              courts of England and Wales, unless you are a consumer entitled to bring proceedings in your
              local courts.
            </p>
          </LegalSection>

          <LegalSection title="13. Contact">
            <p>
              For questions about these Terms, contact us at <strong>legal@kommand.dev</strong>.
            </p>
          </LegalSection>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
