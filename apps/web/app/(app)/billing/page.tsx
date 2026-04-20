import { requireSession } from "@/lib/session";

export default async function BillingPage() {
  const session = await requireSession();
  const account = session.account!;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Billing</h1>
        <p className="mt-1 text-[var(--muted)]">Current plan and credit balance.</p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Plan</div>
          <div className="mt-2 text-2xl font-semibold">{account.plan}</div>
          <div className="mt-1 text-xs text-[var(--muted)]">Status: {account.status}</div>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Credits</div>
          <div className="mt-2 text-2xl font-semibold">
            {account.creditBalance.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">Refill or upgrade coming soon.</div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">
        Billing & upgrade flows will be wired up once the checkout provider is configured.
      </section>
    </div>
  );
}
