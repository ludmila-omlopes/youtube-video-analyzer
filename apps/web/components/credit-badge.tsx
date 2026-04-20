export function CreditBadge({ balance, plan }: { balance: number; plan: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs">
      <span className="text-[var(--muted)]">{plan.toUpperCase()}</span>
      <span className="mx-1 h-3 w-px bg-[var(--border)]" />
      <span className="font-semibold">{balance.toLocaleString()}</span>
      <span className="text-[var(--muted)]">credits</span>
    </span>
  );
}
