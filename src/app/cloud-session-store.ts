import { InMemoryAnalysisSessionStore, type AnalysisSessionStore } from "./session-store.js";

export type CloudSessionStoreDriver = "memory";

const sharedInMemoryCloudSessionStore = new InMemoryAnalysisSessionStore();

export function createCloudSessionStore(): AnalysisSessionStore {
  const driver = (process.env.SESSION_STORE_DRIVER || "memory").trim().toLowerCase();

  if (driver === "memory") {
    return sharedInMemoryCloudSessionStore;
  }

  throw new Error(
    `Unsupported SESSION_STORE_DRIVER "${driver}". Only "memory" is currently implemented in this repository.`
  );
}
