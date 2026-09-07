import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { UPSTREAM_TOOLS, findUpstreamTool } from "./tools.ts";

export function buildUpstreamServer(): Server {
  const server = new Server(
    { name: "colophon-upstream-demo", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: UPSTREAM_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = findUpstreamTool(request.params.name);
    if (!tool) {
      return { isError: true, content: [{ type: "text", text: `unknown upstream tool: ${request.params.name}` }] };
    }
    const result = await tool.handler((request.params.arguments ?? {}) as Record<string, unknown>);
    return { isError: result.isError, content: [{ type: "text", text: result.text }] };
  });

  return server;
}

export async function runUpstreamStdioServer(): Promise<void> {
  const server = buildUpstreamServer();
  const transport = new StdioServerTransport();
  // Keep the process alive for the lifetime of the stdio connection: the
  // CLI entrypoint exits as soon as this promise resolves, so we must not
  // resolve until the client (or the pipe itself) closes the transport.
  const closed = new Promise<void>((resolveClosed) => {
    transport.onclose = () => resolveClosed();
  });
  await server.connect(transport);
  await closed;
}
