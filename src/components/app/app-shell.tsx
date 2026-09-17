import Link from "next/link";
import { ClipboardList, LayoutDashboard, QrCode, ShieldCheck, Users } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import type { StaffMember } from "@/lib/auth/staff";

export function AppShell({
  children,
  currentPath,
  staffMember,
}: {
  children: React.ReactNode;
  currentPath: string;
  staffMember: StaffMember;
}) {
  const navigation = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/guests", label: "Guests", icon: Users },
    { href: "/scanner", label: "Scan pass", icon: QrCode },
    { href: "/attendance", label: "Check-ins", icon: ClipboardList },
    ...(staffMember.role === "organizer"
      ? [{ href: "/admin/staff", label: "Staff access", icon: ShieldCheck }]
      : []),
  ];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link className="app-brand" href="/dashboard">
          <span>GTP</span>
          <strong>Check-in</strong>
        </Link>
        <nav aria-label="Primary navigation" className="app-navigation">
          {navigation.map(({ href, icon: Icon, label }) => (
            <Link
              aria-current={currentPath === href ? "page" : undefined}
              className={currentPath === href ? "nav-link nav-link-active" : "nav-link"}
              href={href}
              key={href}
            >
              <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="staff-summary">
          <span className="staff-avatar" aria-hidden="true">
            {staffMember.normalized_email.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{staffMember.role}</strong>
            <span>{staffMember.normalized_email}</span>
          </div>
        </div>
        <LogoutButton />
      </aside>
      <header className="mobile-app-header">
        <Link className="app-brand" href="/dashboard">
          <span>GTP</span>
          <strong>Check-in</strong>
        </Link>
        <LogoutButton />
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
