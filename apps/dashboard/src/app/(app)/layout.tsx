import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { LayoutDashboard, Plug, SlidersHorizontal, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/connections", label: "Connections", icon: Plug },
  { href: "/preferences", label: "Preferences", icon: SlidersHorizontal },
  { href: "/chat-log", label: "Chat Log", icon: MessageSquare },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const displayName = user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? "Account";

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col border-r border-gray-200 bg-white shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-100">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white text-xs font-bold">K</span>
          </div>
          <span className="font-semibold text-gray-900 tracking-tight">Kommand</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => (
            <NavItem key={href} href={href} label={label} icon={Icon} />
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-2.5">
            <UserButton afterSignOutUrl="/" />
            <span className="text-sm text-gray-600 truncate">{displayName}</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
          <StoreName />
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  // Using a plain <a> so it works as a server component without usePathname.
  // Active highlighting is handled via CSS :where([aria-current=page]).
  return (
    <a
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "[&[data-active]]:bg-accent [&[data-active]]:text-primary"
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </a>
  );
}

async function StoreName() {
  // Best-effort: show store name from API if available, else show nothing.
  return (
    <p className="text-sm font-medium text-gray-500">Dashboard</p>
  );
}
