import SidebarNav from "@/components/sidebar-nav";
import SidebarAccount from "@/components/sidebar-account";

export default function AppLayout({ children }: { children: React.ReactNode }) {
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

        {/* Nav — icons imported in client component to avoid RSC serialization error */}
        <SidebarNav />

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-100">
          <SidebarAccount />
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
          <p className="text-sm font-medium text-gray-500">Dashboard</p>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
