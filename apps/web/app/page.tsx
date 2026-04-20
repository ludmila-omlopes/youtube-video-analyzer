import Link from "next/link";
import { getSession } from "@/lib/session";

export default async function LandingPage() {
  const session = await getSession();
  const signedIn = !!session?.account;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-5xl font-bold tracking-tight">YouTube Video Analyzer</h1>
      <p className="mt-4 max-w-xl text-lg text-[var(--muted)]">
        Submit any YouTube URL and get structured insights powered by Gemini —
        metadata, transcripts, audio summaries, and long-form analysis jobs.
      </p>

      <div className="mt-8 flex gap-3">
        {signedIn ? (
          <Link
            href="/dashboard"
            className="rounded-md bg-[var(--accent)] px-5 py-2.5 font-medium text-white hover:opacity-90"
          >
            Go to dashboard
          </Link>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-[var(--accent)] px-5 py-2.5 font-medium text-white hover:opacity-90"
          >
            Sign in
          </Link>
        )}
        <Link
          href="/docs/api"
          className="rounded-md border border-[var(--border)] px-5 py-2.5 font-medium hover:bg-[var(--surface)]"
        >
          API docs
        </Link>
      </div>
    </main>
  );
}
