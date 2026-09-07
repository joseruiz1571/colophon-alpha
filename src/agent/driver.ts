import type { Scenario, ScenarioCall } from "./scenario.ts";

export interface DriverToolResult {
  isError: boolean;
  content: Array<{ type: string; text?: string }>;
}

export type ToolCaller = (call: ScenarioCall) => Promise<DriverToolResult>;

export interface DriverStepResult {
  index: number;
  call: ScenarioCall;
  isError: boolean;
  summary: string;
}

/**
 * An agent driver replays some sequence of tool calls against whatever
 * `callTool` it is given (in practice, an MCP client connected to the
 * gate). SPEC.md C23: this interface exists so a future, non-scripted
 * driver (an LLM deciding what to call next, see `LlmDriver` below) can
 * be dropped in without changing the gate, the trace, or the CLI wiring
 * — v1 ships only `ScriptDriver`.
 */
export interface AgentDriver {
  run(scenario: Scenario, callTool: ToolCaller): Promise<DriverStepResult[]>;
}

/**
 * Replays a Scenario's calls in file order, one at a time, waiting for
 * each result before issuing the next. It never inspects results to
 * decide what to do next — that is precisely the difference between a
 * scripted driver and an autonomous one. A denied or escalated call does
 * not stop the run: SPEC.md C22 requires `agent run` to exit 0 "regardless
 * of how many calls were denied", since watching refusals happen is the
 * whole point of the demo scenario.
 */
export class ScriptDriver implements AgentDriver {
  async run(scenario: Scenario, callTool: ToolCaller): Promise<DriverStepResult[]> {
    const results: DriverStepResult[] = [];
    for (let i = 0; i < scenario.calls.length; i++) {
      const call = scenario.calls[i]!;
      const result = await callTool(call);
      const text = result.content.map((c) => c.text ?? "").join(" ");
      results.push({
        index: i,
        call,
        isError: result.isError,
        summary: text.length > 160 ? text.slice(0, 157) + "..." : text,
      });
    }
    return results;
  }
}

/**
 * No implementation ships in v1 (SPEC.md §3 "No LLM-driven agent in v1";
 * C23 requires this interface to exist with zero LLM provider dependency
 * anywhere in package.json — see A4). A conforming implementation would
 * choose each next call from the model's output instead of a fixed file,
 * but must still only ever call `callTool` — it has no other path to the
 * gate, so every claim this repository makes about the gate holds
 * unchanged for whatever eventually implements this interface.
 */
export interface LlmDriver extends AgentDriver {}
