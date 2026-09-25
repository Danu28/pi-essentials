export declare const MAX_TASKS = 10;
export declare const MAX_OUTPUT: number;
export declare function parseRisk(h: string): number;
export declare function validateDepends(depends: number[] | undefined, taskCount: number, selfIndex?: number): string | null;
export declare function parseTask(raw: string): {
    title: string;
    refs?: string[];
    check?: string;
    depends?: number[];
};
export declare function slugify(cue: string): string;
export declare function runCmd(cmd: string, cwd: string | undefined, timeoutMs: number): Promise<{
    ok: boolean;
    code: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}>;
//# sourceMappingURL=tool-helpers.d.ts.map