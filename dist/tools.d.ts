import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export declare const MAX_TASKS = 10;
export declare function validateDepends(depends: number[] | undefined, taskCount: number, selfIndex?: number): string | null;
export declare function parseTask(raw: string): {
    title: string;
    refs?: string[];
    check?: string;
    depends?: number[];
};
export declare function registerTools(pi: ExtensionAPI): void;
//# sourceMappingURL=tools.d.ts.map