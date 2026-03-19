import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
        <div className="font-bold text-xl tracking-tight">Kommand</div>
        <div className="flex gap-4">
          <Link
            href="/sign-in"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 pt-24 pb-16 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 mb-6">
          Your business,
          <br />
          as a conversation.
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
          Kommand is an AI agent that runs your Shopify store through WhatsApp.
          Ask anything. Get answers, reports, and actions — instantly.
        </p>
        <Link
          href="/sign-up"
          className="inline-flex items-center bg-gray-900 text-white px-8 py-4 rounded-xl text-lg font-medium hover:bg-gray-700 transition-colors"
        >
          Start free trial
        </Link>
        <p className="mt-4 text-sm text-gray-400">14 days free. No credit card required.</p>
      </section>

      {/* Feature grid */}
      <section className="max-w-5xl mx-auto px-8 py-16 grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          {
            emoji: "💬",
            title: "Text like you think",
            desc: "\"What were my top products last month?\" — done. No dashboards. No menus.",
          },
          {
            emoji: "📊",
            title: "Reports on demand",
            desc: "Ask for a PDF, a spreadsheet, a chart. It builds it and sends it to you.",
          },
          {
            emoji: "⚡",
            title: "Takes action",
            desc: "Process refunds, send customer messages, create discounts. With your approval.",
          },
        ].map((f) => (
          <div key={f.title} className="bg-gray-50 rounded-2xl p-6">
            <div className="text-3xl mb-3">{f.emoji}</div>
            <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
            <p className="text-gray-500 text-sm">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-8 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Simple pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              name: "Starter",
              price: "$29",
              features: ["1 store", "500 agent runs/mo", "Daily brief"],
            },
            {
              name: "Growth",
              price: "$59",
              features: ["2 stores", "2000 runs/mo", "Xero integration", "Proactive analysis"],
              highlighted: true,
            },
            {
              name: "Pro",
              price: "$149",
              features: ["Unlimited stores", "Unlimited runs", "Priority support", "3 team seats"],
            },
          ].map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-6 border ${
                plan.highlighted
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200"
              }`}
            >
              <h3 className="font-semibold text-lg mb-1">{plan.name}</h3>
              <div className="text-3xl font-bold mb-4">
                {plan.price}
                <span className={`text-sm font-normal ${plan.highlighted ? "text-gray-300" : "text-gray-500"}`}>
                  /mo
                </span>
              </div>
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className={`text-sm flex items-center gap-2 ${plan.highlighted ? "text-gray-300" : "text-gray-600"}`}>
                    <span>✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className={`mt-6 block text-center py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  plan.highlighted
                    ? "bg-white text-gray-900 hover:bg-gray-100"
                    : "bg-gray-900 text-white hover:bg-gray-700"
                }`}
              >
                Get started
              </Link>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
