export declare const list: import("convex/server").RegisteredQuery<"internal", {
    viewerKey?: string;
    status?: string;
    exclude?: string;
    limit: number;
}, Promise<{
    id: string;
    viewer_key: string;
    status: string;
    current_step: string | undefined;
    step_index: number;
    step_history: any;
    params: any;
    allow_repeat_ips: boolean;
    created: number;
    updated: number;
}[]>>;
export declare const get: import("convex/server").RegisteredQuery<"internal", {
    id: import("convex/values").GenericId<"stream_sessions">;
}, Promise<{
    id: string;
    viewer_key: string;
    status: string;
    current_step: string | undefined;
    step_index: number;
    step_history: any;
    params: any;
    allow_repeat_ips: boolean;
    created: number;
    updated: number;
} | null>>;
export declare const create: import("convex/server").RegisteredMutation<"internal", {
    currentStep?: string;
    stepIndex?: number;
    stepHistory?: any;
    params?: any;
    allowRepeatIps?: boolean;
    viewerKey: string;
    status: string;
}, Promise<{
    id: string;
    viewer_key: string;
    status: string;
    current_step: string | undefined;
    step_index: number;
    step_history: any;
    params: any;
    allow_repeat_ips: boolean;
    created: number;
    updated: number;
} | null>>;
export declare const update: import("convex/server").RegisteredMutation<"internal", {
    viewerKey?: string;
    status?: string;
    currentStep?: string;
    stepIndex?: number;
    stepHistory?: any;
    params?: any;
    allowRepeatIps?: boolean;
    id: import("convex/values").GenericId<"stream_sessions">;
}, Promise<{
    id: string;
    viewer_key: string;
    status: string;
    current_step: string | undefined;
    step_index: number;
    step_history: any;
    params: any;
    allow_repeat_ips: boolean;
    created: number;
    updated: number;
} | null>>;
//# sourceMappingURL=streamSessions.d.ts.map