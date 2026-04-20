import { serverFetch } from "@/lib/api-client";
import type { ApiKeyRecord } from "@/lib/types";
import { ApiKeysClient } from "./api-keys-client";

type ListResponse = { apiKeys: ApiKeyRecord[] };

export default async function ApiKeysPage() {
  const data = await serverFetch<ListResponse>("/api/web/api-keys").catch(() => ({ apiKeys: [] }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">API Keys</h1>
        <p className="mt-1 text-[var(--muted)]">
          Use these keys to call <code className="text-xs">/api/v1/*</code> from your own code.
          Send them as <code className="text-xs">Authorization: Bearer &lt;key&gt;</code>.
        </p>
      </header>

      <ApiKeysClient initialKeys={data.apiKeys} />
    </div>
  );
}
