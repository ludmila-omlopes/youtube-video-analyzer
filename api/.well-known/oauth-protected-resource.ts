import { handleProtectedResourceMetadataRequest } from "../../src/http/handle-protected-resource-metadata-request.js";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleProtectedResourceMetadataRequest(request);
}
