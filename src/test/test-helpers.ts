export const testLogger = {
  requestId: "test-request",
  tool: "test-tool",
  child: () => testLogger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
