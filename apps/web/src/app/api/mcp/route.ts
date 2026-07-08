import { NextResponse, type NextRequest } from "next/server";
import { resolveApiKeyUser } from "@/lib/api-keys";
import { findMcpTool, mcpTools, type McpToolContext } from "@/lib/mcp/tools";

/**
 * Stateless MCP server over Streamable HTTP.
 *
 * Speaks JSON-RPC 2.0 via POST with JSON responses — sufficient for
 * tools-only servers and compatible with `claude mcp add --transport http`.
 * Auth: `Authorization: Bearer ctx_…` platform API key (create in Settings).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 320; // wait_for_job may block up to 300s

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const rpcError = (id: unknown, code: number, message: string, status = 200) =>
  NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status },
  );

const rpcResult = (id: unknown, result: unknown) =>
  NextResponse.json({ jsonrpc: "2.0", id, result });

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const user = authHeader.startsWith("Bearer ")
    ? await resolveApiKeyUser(authHeader.slice("Bearer ".length))
    : null;
  if (!user) {
    return NextResponse.json(
      {
        error:
          "Unauthorized. Pass a CTXAI platform API key: Authorization: Bearer ctx_… (create one in Settings → API keys)",
      },
      { status: 401 },
    );
  }

  let message: {
    jsonrpc?: string;
    id?: unknown;
    method?: string;
    params?: Record<string, unknown>;
  };
  try {
    message = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error", 400);
  }

  const { id, method, params } = message;

  // Notifications get an empty 202 per the Streamable HTTP spec.
  if (id === undefined) {
    return new NextResponse(null, { status: 202 });
  }

  const ctx: McpToolContext = {
    userId: user.id,
    origin: process.env.BETTER_AUTH_URL?.replace(/\/$/, "") || new URL(req.url).origin,
  };

  switch (method) {
    case "initialize": {
      const requested = String(params?.protocolVersion ?? "");
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "ctxai", version: "0.1.0" },
        instructions:
          "CTXAI generation server. Call list_models first to see available models and parameters. generate_* tools return a job_id; use wait_for_job to block until the result is ready, then download assets from their URLs with the same Authorization header.",
      });
    }

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: mcpTools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const name = String(params?.name ?? "");
      const tool = findMcpTool(name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
      try {
        const result = await tool.execute(
          (params?.arguments as Record<string, unknown>) ?? {},
          ctx,
        );
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      } catch (err) {
        return rpcResult(id, {
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : "Tool call failed",
            },
          ],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

/** Stateless server: no server-initiated SSE stream, no sessions. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
