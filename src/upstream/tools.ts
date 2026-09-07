import { resolveWithinFixtures, FIXTURES_ROOT } from "./fixtures-root.ts";

export interface UpstreamToolResult {
  isError: boolean;
  text: string;
}

export interface UpstreamToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<UpstreamToolResult>;
}

function ok(payload: unknown): UpstreamToolResult {
  return { isError: false, text: JSON.stringify(payload) };
}

function err(message: string): UpstreamToolResult {
  return { isError: true, text: message };
}

/**
 * The synthetic demo upstream (SPEC.md F4/C21). Every tool here is a
 * closed, offline stand-in over fixtures/ — none makes a real network
 * call or touches the filesystem outside fixtures/, regardless of what
 * the gate in front of it decided.
 */
export const UPSTREAM_TOOLS: UpstreamToolDef[] = [
  {
    name: "fs.read",
    description: "Read a UTF-8 text file from the synthetic fixture filesystem.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string" },
        data_class: { type: "string" },
      },
    },
    handler: async (args) => {
      const path = args.path as string;
      const resolved = resolveWithinFixtures(path);
      if (!resolved) return err(`fs.read: refusing path outside fixtures/: ${path}`);
      const file = Bun.file(resolved);
      if (!(await file.exists())) return err(`fs.read: no such fixture file: ${path}`);
      return ok({ path, content: await file.text() });
    },
  },
  {
    name: "fs.write",
    description: "Write a UTF-8 text file into the synthetic fixture filesystem.",
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        data_class: { type: "string" },
      },
    },
    handler: async (args) => {
      const path = args.path as string;
      const content = args.content as string;
      const resolved = resolveWithinFixtures(path);
      if (!resolved) {
        return err(`fs.write: refusing path outside fixtures/: ${path}`);
      }
      await Bun.write(resolved, content);
      return ok({ path, bytesWritten: content.length });
    },
  },
  {
    name: "repo.list",
    description: "List repositories in the synthetic fixture org.",
    inputSchema: { type: "object", properties: { data_class: { type: "string" } } },
    handler: async () => {
      const glob = new Bun.Glob("*");
      const repos: string[] = [];
      for await (const entry of glob.scan({ cwd: `${FIXTURES_ROOT}/repos`, onlyFiles: false })) {
        repos.push(entry);
      }
      repos.sort();
      return ok({ repos });
    },
  },
  {
    name: "repo.read_settings",
    description: "Read a synthetic repository's settings (branch protection, visibility).",
    inputSchema: {
      type: "object",
      required: ["repo"],
      properties: { repo: { type: "string" }, data_class: { type: "string" } },
    },
    handler: async (args) => {
      const repo = args.repo as string;
      const resolved = resolveWithinFixtures(`fixtures/repos/${repo}/settings.json`);
      if (!resolved) return err(`repo.read_settings: invalid repo name: ${repo}`);
      const file = Bun.file(resolved);
      if (!(await file.exists())) return err(`repo.read_settings: unknown fixture repo: ${repo}`);
      return ok(JSON.parse(await file.text()));
    },
  },
  {
    name: "auth.request_scopes",
    description: "Synthetic credential-scope request. Never issues a real credential.",
    inputSchema: {
      type: "object",
      required: ["scopes"],
      properties: { scopes: { type: "array", items: { type: "string" } } },
    },
    handler: async (args) => {
      return ok({
        granted: false,
        requested_scopes: args.scopes,
        message: "synthetic demo upstream: no real credential issuance exists",
      });
    },
  },
  {
    name: "net.fetch",
    description: "Synthetic HTTP fetch. Never makes a real network call.",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: { url: { type: "string" } },
    },
    handler: async (args) => {
      return ok({
        url: args.url,
        status: 200,
        body: "synthetic fixture response: no real network call was made",
      });
    },
  },
  {
    name: "mail.send",
    description: "Synthetic mail send. Never sends real mail.",
    inputSchema: {
      type: "object",
      required: ["to", "body"],
      properties: { to: { type: "string" }, body: { type: "string" } },
    },
    handler: async (args) => {
      return ok({
        to: args.to,
        sent: false,
        message: "synthetic demo upstream: no real mail transport exists",
      });
    },
  },
];

export function findUpstreamTool(name: string): UpstreamToolDef | undefined {
  return UPSTREAM_TOOLS.find((t) => t.name === name);
}
