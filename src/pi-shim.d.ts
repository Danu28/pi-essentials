declare module "@earendil-works/pi-coding-agent" {
  export type PiEntry = { key: string; value: unknown; [k: string]: unknown };
  export type PiSessionContext = {
    entries?: unknown[];
    cwd: string;
    store?: { entries?: unknown[] };
    getContextUsage?: () => { percent?: number | null; tokens?: number; contextWindow?: number } | null;
    ui?: { notify?: (msg: string, level?: string) => void };
  };
  export type PiToolEvent = {
    toolName?: string;
    name?: string;
    params?: Record<string, unknown>;
    input?: Record<string, unknown>;
    args?: Record<string, unknown>;
    goal?: unknown;
    toolInput?: Record<string, unknown>;
  };
  export type PiToolResultEvent = PiToolEvent & {
    isError?: boolean;
    result?: { details?: Record<string, unknown> };
  };
  export type PiBeforeCompactEvent = { summary?: string };
  export type PiContextEvent = { messages?: Array<{ role: string; content: unknown }> };

  export interface ExtensionAPI {
    on(
      event: "session_start",
      handler: (ev: unknown, ctx: PiSessionContext) => unknown | Promise<unknown>,
    ): void;
    on(
      event: "tool_call",
      handler: (ev: PiToolEvent) => unknown | Promise<unknown>,
    ): void;
    on(
      event: "tool_result",
      handler: (ev: PiToolResultEvent) => unknown | Promise<unknown>,
    ): void;
    on(
      event: "session_before_compact",
      handler: (ev: PiBeforeCompactEvent) => unknown | Promise<unknown>,
    ): void;
    on(
      event: "context",
      handler: (ev: PiContextEvent, ctx: PiSessionContext) => unknown | Promise<unknown>,
    ): void;
    on(event: string, handler: (ev: unknown, ctx: PiSessionContext) => unknown | Promise<unknown>): void;
    registerTool(tool: unknown): void;
    registerCommand(name: string, cmd: { description: string; handler: (args: string, ctx: PiSessionContext) => unknown | Promise<unknown> }): void;
    appendEntry?: (key: string, value: unknown) => Promise<void>;
  }
}
declare module "typebox" {
  export const Type: any;
}
