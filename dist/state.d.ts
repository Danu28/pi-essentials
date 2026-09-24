export interface MemoEpisode {
    id: string;
    cue: string;
    summary: string;
    detail?: string;
    tags?: string[];
    refs?: string[];
    ts: number;
}
export interface Deliberation {
    id: string;
    goal: string;
    hypotheses: string[];
    winner?: string;
    conclusion?: string;
    ts: number;
    links?: string[];
}
export interface PlanTask {
    title: string;
    done: boolean;
    refs?: string[];
    check?: string;
    depends?: number[];
}
export interface Plan {
    id: string;
    goal: string;
    tasks: PlanTask[];
    ts: number;
}
export interface IntelProfile {
    cwd: string;
    lang: string;
    name?: string;
    scripts: Record<string, string>;
    testCmd: string;
    lintCmd: string;
    buildCmd: string;
    scannedAt: number;
    text: string;
}
export declare const MAX_MEMOS = 100;
export declare const memos: Map<string, MemoEpisode>;
export declare const deliberations: Deliberation[];
export declare const plans: Map<string, Plan>;
export declare let latestPlan: Plan | undefined;
export declare let focusLine: string | null;
export declare let intelCache: IntelProfile | null;
/** Evict oldest memos (by ts) until size <= MAX_MEMOS. LRU-ish. */
export declare function enforceMemoCap(): string[];
declare global {
    var __pi_ess_focus: string | undefined;
    var __pi_ess_intel: IntelProfile | undefined;
    var __pi_ess_plan: Plan | undefined;
}
export declare function tokenize(s: string): string[];
export declare function scoreEpisode(e: MemoEpisode, q: string, filterTags?: string[]): number;
export declare function truncate(s: string, n?: number): string;
export declare function hydrate(entries: unknown[]): void;
export declare function clearState(): void;
//# sourceMappingURL=state.d.ts.map