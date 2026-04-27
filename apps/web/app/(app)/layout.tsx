import Link from "next/link";
import { requireSession } from "@/lib/session";
import { CreditBadge } from "@/components/credit-badge";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="font-semibold">
            YT Analyzer
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/dashboard" className="hover:text-white text-[var(--muted)]">Dashboard</Link>
            <Link href="/analyze" className="hover:text-white text-[var(--muted)]">Analyze</Link>
            <Link href="/history" className="hover:text-white text-[var(--muted)]">History</Link>
            <Link href="/billing" className="hover:text-white text-[var(--muted)]">Billing</Link>
            <CreditBadge balance={session.account!.creditBalance} plan={session.account!.plan} />
            <a
              href="/logout"
              className="rounded-md border border-[var(--border)] px-3 py-1 hover:bg-[var(--bg)]"
            >
              Sign out
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
