import { parse as parseYaml } from "yaml";

export interface ScenarioCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface Scenario {
  name: string;
  description?: string;
  calls: ScenarioCall[];
}

export async function loadScenario(path: string): Promise<Scenario> {
  const text = await Bun.file(path).text();
  const raw = parseYaml(text) as {
    name?: string;
    description?: string;
    calls?: Array<{ name: string; arguments?: Record<string, unknown> }>;
  };
  if (!raw || !Array.isArray(raw.calls)) {
    throw new Error(`colophon: scenario ${path} is missing a 'calls' list`);
  }
  return {
    name: raw.name ?? path,
    description: raw.description,
    calls: raw.calls.map((c) => ({ name: c.name, arguments: c.arguments ?? {} })),
  };
}
