import { handleMcpHttpRequest } from "./mcp.js";
import { authenticateMcpRequest } from "./authenticate-mcp-request.js";

export async function handleProtectedMcpHttpRequest(request: Request): Promise<Response> {
  const auth = await authenticateMcpRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  return handleMcpHttpRequest(request, { principal: auth.principal });
}
