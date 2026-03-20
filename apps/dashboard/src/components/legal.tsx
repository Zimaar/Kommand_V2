import Link from "next/link";

export const LEGAL_YEAR = new Date().getFullYear();

export function LegalNav(): React.ReactElement {
  return (
    <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#534AB7] flex items-center justify-center">
            <span className="text-white text-xs font-bold">K</span>
          </div>
          <span className="font-semibold text-gray-900 tracking-tight">Kommand</span>
        </Link>
        <Link href="/" className="text-sm text-gray-400 hover:text-gray-900 transition-colors">
          Back to home
        </Link>
      </div>
    </nav>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="mb-10">
      <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
      <div className="text-gray-600 text-[15px] leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export function LegalFooter(): React.ReactElement {
  return (
    <footer className="border-t border-gray-100 py-8">
      <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-gray-400 text-sm">&copy; {LEGAL_YEAR} Kommand</p>
        <div className="flex gap-5">
          <Link href="/privacy" className="text-gray-400 hover:text-gray-900 text-sm transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="text-gray-400 hover:text-gray-900 text-sm transition-colors">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
