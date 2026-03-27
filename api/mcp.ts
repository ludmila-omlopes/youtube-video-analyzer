import { handleMcpHttpRequest } from "../src/http/mcp.js";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleMcpHttpRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpHttpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpHttpRequest(request);
}
