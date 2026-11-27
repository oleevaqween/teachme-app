"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  ClipboardList,
  Briefcase,
  FileText,
  Settings,
  Archive,
  Menu,
  X,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSwitch } from "@/components/theme/ThemeSwitch";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/cv-studio", label: "CV Studio", icon: FileText },
  { href: "/applications", label: "Applications", icon: ClipboardList },
  { href: "/interview", label: "Interview", icon: Briefcase },
  { href: "/teach-me", label: "Teach Me", icon: BookOpen },
  { href: "/interview/archive", label: "Archive", icon: Archive },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * The single nav item for the current page: the longest matching href, so
 * /interview/archive highlights "Archive" only, not "Interview" as well.
 */
export function activeNavHref(pathname: string): string | undefined {
  return navItems
    .map((item) => item.href)
    .filter((href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/")))
    .sort((a, b) => b.length - a.length)[0];
}

export function Navigation() {
  const pathname = usePathname();
  const activeHref = activeNavHref(pathname);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav
        className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
        aria-label="Main navigation"
      >
        {/* Logo / Brand */}
        <Link
          href="/"
          className="flex items-center gap-2 text-lead font-semibold tracking-tight text-foreground"
        >
          <BookOpen className="size-5 text-primary" aria-hidden="true" />
          <span>TeachMe</span>
        </Link>

        {/* Desktop navigation */}
        <ul className="hidden items-center gap-1 md:flex" role="list">
          {navItems.map((item) => {
            const isActive = item.href === activeHref;
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-small font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2">
          <ThemeSwitch />
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile navigation */}
      {mobileMenuOpen && (
        <div
          id="mobile-menu"
          className="border-t border-border md:hidden"
          role="navigation"
          aria-label="Mobile navigation"
        >
          <ul className="space-y-1 px-4 py-3" role="list">
            {navItems.map((item) => {
              const isActive = item.href === activeHref;
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-small font-medium transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </header>
  );
}
