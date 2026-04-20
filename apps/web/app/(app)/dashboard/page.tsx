import Link from "next/link";
import { requireSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await requireSession();
  const account = session.account!;
  const runs = session.recentRuns ?? [];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <p className="mt-1 text-[var(--muted)]">
          Account <code className="text-xs">{account.accountId}</code> · plan{" "}
          <strong>{account.plan}</strong>
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Credits" value={account.creditBalance.toLocaleString()} hint="Available now" />
        <Card title="Plan" value={account.plan} hint={account.status} />
        <Card title="Last seen" value={new Date(account.lastSeenAt).toLocaleDateString()} hint="" />
      </section>

      {session.onboarding?.state === "first-run" && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold">Get started</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {session.onboarding.nextAction ?? "Run your first analysis to see it here."}
          </p>
          <Link
            href="/analyze"
            className="mt-3 inline-block rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Run your first analysis
          </Link>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent runs</h2>
          <Link href="/history" className="text-sm text-[var(--muted)] hover:text-white">
            View all →
          </Link>
        </div>

        {runs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No runs yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
            {runs.slice(0, 5).map((r) => (
              <li key={r.runId} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{r.kind}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {new Date(r.createdAt).toLocaleString()}
                  </div>
                </div>
                <span className="text-xs text-[var(--muted)]">{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{title}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>}
    </div>
  );
}
