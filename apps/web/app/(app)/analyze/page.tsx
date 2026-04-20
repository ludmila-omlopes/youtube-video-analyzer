import { AnalyzeForm } from "./analyze-form";

export default function AnalyzePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Analyze a video</h1>
        <p className="mt-1 text-[var(--muted)]">
          Paste a YouTube URL and pick an analysis type. Each run consumes credits based on the type.
        </p>
      </header>
      <AnalyzeForm />
    </div>
  );
}
