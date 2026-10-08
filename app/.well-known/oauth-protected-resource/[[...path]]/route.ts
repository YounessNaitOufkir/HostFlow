import {
  generateProtectedResourceMetadata,
  getPublicOrigin,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

/**
 * Where Claude learns who signs people in for /api/mcp (RFC 9728): Supabase's
 * OAuth server. /api/mcp's 401 points here, Claude reads it, registers itself
 * with Supabase and sends the person to /oauth/consent.
 *
 * Served at both /.well-known/oauth-protected-resource and its path-suffixed
 * form /.well-known/oauth-protected-resource/api/mcp, which MCP clients try
 * first. The resource is the connector's own URL, not the site root.
 *
 * Must stay reachable signed out - proxy.ts lets /.well-known through.
 */
export function GET(req: Request) {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
    resourceUrl: `${getPublicOrigin(req)}/api/mcp`,
  });
  return Response.json(metadata, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=3600" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
