import { handleProtectedMcpHttpRequest } from "../src/http/handle-protected-mcp-request.js";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleProtectedMcpHttpRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleProtectedMcpHttpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleProtectedMcpHttpRequest(request);
}
