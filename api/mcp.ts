import { handleMcpHttpSurfaceRequest } from "../src/http/http-surface.js";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleMcpHttpSurfaceRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpHttpSurfaceRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpHttpSurfaceRequest(request);
}