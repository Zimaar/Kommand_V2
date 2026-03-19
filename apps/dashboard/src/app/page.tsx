import Link from "next/link";

export const dynamic = "force-static";

const YEAR = new Date().getFullYear();

// ─── Data ────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Starter",
    price: "$29",
    desc: "One store, getting started.",
    features: ["1 store", "500 agent runs / mo", "Daily brief"],
    highlighted: false,
  },
  {
    name: "Growth",
    price: "$59",
    desc: "Scale with full capabilities.",
    features: ["2 stores", "2,000 runs / mo", "Xero integration", "Proactive analysis"],
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$149",
    desc: "No limits, no compromises.",
    features: ["Unlimited stores", "Unlimited runs", "Priority support", "3 team seats"],
    highlighted: false,
  },
];

const CAPABILITIES = [
  {
    label: "Deep analysis",
    owner:
      "What are my top 5 products by profit margin this quarter, and how do they compare to last quarter?",
    agent:
      "Pulling Q2 order + cost data…\n\nTop 5 by margin:\n1. Merino Wool Sweater — 68% (+4pp)\n2. Canvas Tote — 61% (−1pp)\n3. Leather Wallet — 58% (+7pp)\n4. Cotton Hoodie — 52% (stable)\n5. Silk Scarf — 49% (+2pp)\n\nLeather Wallet had the biggest jump — your cost dropped 12% while price held.",
    proactive: false,
  },
  {
    label: "Bulk action",
    owner:
      "Give a 20% loyalty discount to everyone who spent over $500 this year but hasn't ordered in 60 days.",
    agent:
      "Found 47 customers matching that criteria.\n\nDiscount code: LOYAL20 (20% off, expires 30 days)\n\nSend personalised WhatsApp message to all 47 now?\n\n[Yes, send] [No]",
    proactive: false,
  },
  {
    label: "Market research",
    owner:
      "My supplier raised prices 15%. How does this affect my margins, and what are competitors charging?",
    agent:
      "Ran the numbers on your 12 affected SKUs:\n• Avg margin: 54% → 46%\n• 3 products drop below 40%: Linen Shirt, Raw Denim, Canvas Jacket\n\nChecked 4 competitors — they're at $89–$105 for Linen Shirts. You're at $79. Room to raise $10 without losing ground.",
    proactive: false,
  },
  {
    label: "Proactive alert",
    owner: "",
    agent:
      "⚡ Heads up — your return rate jumped to 8.2% this week (3-month avg: 3.1%).\n\nAll 11 returns are the Black Wool Sweater, size L. Same complaint: \"runs small.\"\n\nWant me to flag this to your supplier and update the product description?",
    proactive: true,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      <Nav />
      <Hero />
      <Problem />
      <NotAChatbot />
      <Capabilities />
      <Pricing />
      <FinalCTA />
      <Footer />
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav(): React.ReactElement {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a12]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#534AB7] flex items-center justify-center">
            <span className="text-white text-xs font-bold">K</span>
          </div>
          <span className="font-semibold text-white tracking-tight">Kommand</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/sign-in"
            className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="text-sm bg-[#534AB7] hover:bg-[#4540a0] text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero(): React.ReactElement {
  return (
    <section className="max-w-6xl mx-auto px-6 pt-20 pb-24 lg:pt-28 lg:pb-32">
      <div className="flex flex-col lg:flex-row lg:items-center gap-16">
        {/* Left */}
        <div className="flex-1 max-w-xl">
          <div className="inline-flex items-center gap-2 bg-[#534AB7]/20 border border-[#534AB7]/40 rounded-full px-3 py-1 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#534AB7] animate-pulse" />
            <span className="text-xs text-[#a09ae0] font-medium">AI agent for Shopify owners</span>
          </div>
          <h1 className="text-5xl lg:text-6xl font-bold leading-[1.08] tracking-tight mb-6">
            Your business,
            <br />
            <span className="text-[#534AB7]">as a conversation.</span>
          </h1>
          <p className="text-lg text-gray-400 leading-relaxed mb-8 max-w-md">
            Kommand is an AI agent that runs your Shopify store through WhatsApp. Text it
            like you&apos;d text your COO — it reasons, acts, and delivers.
          </p>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <Link
              href="/sign-up"
              className="bg-[#534AB7] hover:bg-[#4540a0] text-white px-7 py-3.5 rounded-xl text-base font-semibold transition-colors"
            >
              Start free trial
            </Link>
            <p className="text-sm text-gray-500 self-center">14 days free · No credit card</p>
          </div>
        </div>

        {/* Right */}
        <div className="flex-shrink-0 flex justify-center lg:justify-end w-full lg:w-auto">
          <WhatsAppMock />
        </div>
      </div>
    </section>
  );
}

function WhatsAppMock(): React.ReactElement {
  return (
    <div className="relative">
      <div className="absolute inset-0 bg-[#534AB7]/20 blur-3xl rounded-full scale-75 pointer-events-none" />
      <div className="relative w-72 rounded-[2rem] border-2 border-white/10 bg-[#0b141a] shadow-2xl overflow-hidden">
        {/* Chat header */}
        <div className="bg-[#1f2c34] px-4 py-3 flex items-center gap-3 border-b border-white/5">
          <div className="w-9 h-9 rounded-full bg-[#534AB7] flex items-center justify-center text-white text-sm font-bold shrink-0">
            K
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold leading-tight">Kommand</p>
            <p className="text-[#8696a0] text-xs">online</p>
          </div>
        </div>

        {/* Messages */}
        <div className="px-3 py-4 space-y-2.5 bg-[#0b141a]">
          {/* Owner message */}
          <div className="flex justify-end">
            <div className="bg-[#005c4b] text-white text-sm rounded-2xl rounded-tr-sm px-3 py-2 max-w-[82%] leading-snug">
              Compare last 6 months vs the same period last year. Send me a PDF.
              <span className="text-[#53bdeb] text-xs ml-1.5">✓✓</span>
            </div>
          </div>

          {/* Working */}
          <div className="flex justify-start">
            <div className="bg-[#1a2530] text-[#8696a0] text-xs rounded-2xl rounded-tl-sm px-3 py-1.5 italic">
              Pulling 3,847 orders from Shopify…
            </div>
          </div>
          <div className="flex justify-start">
            <div className="bg-[#1a2530] text-[#8696a0] text-xs rounded-2xl rounded-tl-sm px-3 py-1.5 italic">
              Running 6-month comparison analysis…
            </div>
          </div>

          {/* Result */}
          <div className="flex justify-start">
            <div className="bg-[#1f2c34] text-white text-sm rounded-2xl rounded-tl-sm px-3.5 py-3 max-w-[88%] leading-relaxed space-y-1">
              <p className="font-semibold mb-2">H1 2024 vs H1 2023</p>
              <p>
                <span className="text-[#00a884]">↗</span> Revenue{" "}
                <span className="font-medium">£127k</span>{" "}
                <span className="text-[#8696a0] text-xs">+23%</span>
              </p>
              <p>
                <span className="text-[#00a884]">↗</span> Orders{" "}
                <span className="font-medium">1,847</span>{" "}
                <span className="text-[#8696a0] text-xs">+18%</span>
              </p>
              <p>
                <span className="text-[#00a884]">↗</span> AOV{" "}
                <span className="font-medium">£68.80</span>{" "}
                <span className="text-[#8696a0] text-xs">+4%</span>
              </p>
              <p>
                <span className="text-[#ff7043]">↘</span> Returns{" "}
                <span className="font-medium">3.2%</span>{" "}
                <span className="text-[#8696a0] text-xs">−0.8pp ✓</span>
              </p>
              <p className="text-[#8696a0] text-xs mt-2 pt-1.5 border-t border-white/5">
                Top: Merino Wool Sweater (£31k)
              </p>
              <p className="text-[#8696a0] text-xs">10:47 ✓✓</p>
            </div>
          </div>

          {/* PDF */}
          <div className="flex justify-start">
            <div className="bg-[#1f2c34] text-white text-sm rounded-2xl rounded-tl-sm px-3 py-2.5 max-w-[88%] flex items-center gap-3">
              <div className="w-10 h-10 bg-[#cc3429] rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0">
                PDF
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight truncate">H1_2024_Report.pdf</p>
                <p className="text-[#8696a0] text-xs">2.4 MB · tap to open</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Problem ──────────────────────────────────────────────────────────────────

function Problem(): React.ReactElement {
  const apps = [
    "Shopify",
    "Xero",
    "Excel",
    "Gmail",
    "Google Analytics",
    "Slack",
    "Notion",
    "QuickBooks",
  ];
  const rotations = [
    "-rotate-2",
    "rotate-1",
    "-rotate-1",
    "rotate-2",
    "-rotate-3",
    "rotate-1",
    "-rotate-2",
    "rotate-3",
  ];

  return (
    <section className="bg-white py-24 text-gray-900">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            You manage 8 apps to run 1 business.
          </h2>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Shopify for orders. Xero for accounting. Excel for analysis. Gmail for customers.
            Every answer requires opening three tabs.
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch gap-5 md:gap-8">
          {/* Before */}
          <div className="flex-1 bg-gray-50 rounded-2xl p-8 border border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6 text-center">
              Before Kommand
            </p>
            <div className="flex flex-wrap gap-2.5 justify-center">
              {apps.map((app, i) => (
                <span
                  key={app}
                  className={`px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-600 shadow-sm ${rotations[i]}`}
                >
                  {app}
                </span>
              ))}
            </div>
            <p className="text-center text-gray-400 text-sm mt-6">
              Context switching. Manual exports. Stale data.
            </p>
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center text-2xl text-gray-300">
            <span className="rotate-90 md:rotate-0">→</span>
          </div>

          {/* After */}
          <div className="flex-1 bg-[#534AB7] rounded-2xl p-8 text-white flex flex-col items-center justify-center">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-6 text-center">
              With Kommand
            </p>
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-5">
              <span className="text-3xl">💬</span>
            </div>
            <p className="font-semibold text-lg mb-2">WhatsApp</p>
            <p className="text-white/70 text-sm text-center max-w-[200px]">
              One conversation. Every tool. All from your phone.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Not a chatbot ────────────────────────────────────────────────────────────

function NotAChatbot(): React.ReactElement {
  const steps = [
    { icon: "💬", label: "Owner asks", detail: "\"6-month PDF comparison\"" },
    { icon: "🧠", label: "Agent plans", detail: "Full workflow before first action" },
    { icon: "🏪", label: "Pulls data", detail: "3,847 orders via Shopify API" },
    { icon: "🐍", label: "Runs Python", detail: "Pandas + matplotlib analysis" },
    { icon: "📄", label: "Builds PDF", detail: "Charts, tables, insights" },
    { icon: "📲", label: "Delivers", detail: "Sent to WhatsApp in ~12s" },
  ];

  return (
    <section className="bg-[#0a0a12] py-24 border-t border-white/5">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-[#534AB7] font-semibold text-sm uppercase tracking-widest mb-3">
            The difference
          </p>
          <h2 className="text-4xl font-bold text-white mb-4">Not a chatbot. An agent.</h2>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            A chatbot answers questions. Kommand reasons, chains tools, and delivers outcomes.
            Watch it handle a request no chatbot could.
          </p>
        </div>

        {/* Trigger request */}
        <div className="flex justify-center mb-12">
          <div className="bg-[#005c4b] text-white text-base rounded-2xl px-5 py-3 max-w-sm text-center font-medium leading-snug">
            &ldquo;Compare last 6 months to the same period last year. Give me a PDF report.&rdquo;
          </div>
        </div>

        {/* Step flow */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
          {steps.map((step, i) => (
            <div key={step.label} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-[calc(50%+2rem)] right-0 h-px bg-white/10" />
              )}
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl">
                  {step.icon}
                </div>
                <p className="text-white text-sm font-semibold">{step.label}</p>
                <p className="text-gray-500 text-xs leading-snug">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-gray-600 text-sm mt-10">
          Composed at runtime from 7 primitives. No pre-built reports. No fixed workflows.
        </p>
      </div>
    </section>
  );
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

function Capabilities(): React.ReactElement {
  return (
    <section className="bg-white py-24 text-gray-900">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-[#534AB7] font-semibold text-sm uppercase tracking-widest mb-3">
            Real examples
          </p>
          <h2 className="text-4xl font-bold text-gray-900 mb-4">What it actually looks like</h2>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            These aren&apos;t cherry-picked demos. This is how owners use it every day.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {CAPABILITIES.map((cap) => (
            <CapabilityCard key={cap.label} cap={cap} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CapabilityCard({
  cap,
}: {
  cap: (typeof CAPABILITIES)[number];
}): React.ReactElement {
  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="bg-gray-50 border-b border-gray-100 px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          {cap.label}
        </span>
        {cap.proactive && (
          <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
            Proactive
          </span>
        )}
      </div>
      <div className="bg-[#0b141a] p-4 space-y-2.5">
        {cap.owner && (
          <div className="flex justify-end">
            <div className="bg-[#005c4b] text-white text-sm rounded-xl rounded-tr-sm px-3 py-2 max-w-[85%] leading-snug">
              {cap.owner}
            </div>
          </div>
        )}
        <div className="flex justify-start">
          <div className="bg-[#1f2c34] text-white text-sm rounded-xl rounded-tl-sm px-3 py-2.5 max-w-[90%] leading-relaxed whitespace-pre-line">
            {cap.agent}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

function Pricing(): React.ReactElement {
  return (
    <section className="bg-gray-50 py-24 border-t border-gray-100 text-gray-900">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-bold text-gray-900 mb-3">Simple pricing</h2>
          <p className="text-gray-500">14-day free trial on all plans. No credit card required.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-7 flex flex-col ${
                plan.highlighted
                  ? "bg-[#534AB7] text-white ring-2 ring-[#534AB7] ring-offset-2 ring-offset-gray-50"
                  : "bg-white border border-gray-200 text-gray-900"
              }`}
            >
              <p
                className={`text-sm font-semibold mb-1 ${
                  plan.highlighted ? "text-white/70" : "text-gray-400"
                }`}
              >
                {plan.name}
              </p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span
                  className={`text-sm mb-1.5 ${
                    plan.highlighted ? "text-white/60" : "text-gray-400"
                  }`}
                >
                  / mo
                </span>
              </div>
              <p
                className={`text-sm mb-6 ${
                  plan.highlighted ? "text-white/70" : "text-gray-500"
                }`}
              >
                {plan.desc}
              </p>
              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className={`text-sm flex items-center gap-2 ${
                      plan.highlighted ? "text-white/90" : "text-gray-600"
                    }`}
                  >
                    <span
                      className={`text-xs ${
                        plan.highlighted ? "text-white/60" : "text-[#534AB7]"
                      }`}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className={`text-center py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  plan.highlighted
                    ? "bg-white text-[#534AB7] hover:bg-gray-100"
                    : "bg-[#534AB7] text-white hover:bg-[#4540a0]"
                }`}
              >
                Start free trial
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────

function FinalCTA(): React.ReactElement {
  return (
    <section className="bg-[#0a0a12] py-28 border-t border-white/5">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
          Start free. See what happens when your business fits in one conversation.
        </h2>
        <p className="text-gray-400 text-lg mb-10">14 days free, then from $29/mo. Cancel any time.</p>
        <Link
          href="/sign-up"
          className="inline-block bg-[#534AB7] hover:bg-[#4540a0] text-white px-10 py-4 rounded-xl text-lg font-semibold transition-colors"
        >
          Start free trial
        </Link>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer(): React.ReactElement {
  return (
    <footer className="bg-[#0a0a12] border-t border-white/5 py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#534AB7] flex items-center justify-center">
            <span className="text-white text-xs font-bold">K</span>
          </div>
          <span className="text-gray-400 text-sm font-medium">Kommand</span>
        </div>
        <p className="text-gray-600 text-sm">
          © {YEAR} Kommand. Built for Shopify owners.
        </p>
        <div className="flex gap-5">
          <Link
            href="/sign-in"
            className="text-gray-600 hover:text-gray-300 text-sm transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="text-gray-600 hover:text-gray-300 text-sm transition-colors"
          >
            Get started
          </Link>
        </div>
      </div>
    </footer>
  );
}
