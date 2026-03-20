"use client";

import { LayoutDashboard, Plug, SlidersHorizontal, MessageSquare } from "lucide-react";
import { NavItem } from "./nav-item";

const navItems = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/connections", label: "Connections", icon: Plug },
  { href: "/preferences", label: "Preferences", icon: SlidersHorizontal },
  { href: "/chat-log", label: "Chat Log", icon: MessageSquare },
];

export default function SidebarNav(): React.ReactElement {
  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
      {navItems.map(({ href, label, icon }) => (
        <NavItem key={href} href={href} label={label} icon={icon} />
      ))}
    </nav>
  );
}
