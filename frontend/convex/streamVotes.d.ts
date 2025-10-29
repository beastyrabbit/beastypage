export declare const list: import("convex/server").RegisteredQuery<"internal", {
    stepId?: string;
    session: import("convex/values").GenericId<"stream_sessions">;
    limit: number;
}, Promise<{
    id: string;
    session: string;
    step_id: string;
    option_key: string;
    option_meta: any;
    votedby: string | null;
    created: number;
    updated: number;
}[]>>;
export declare const create: import("convex/server").RegisteredMutation<"internal", {
    optionMeta?: any;
    votedBy?: import("convex/values").GenericId<"stream_participants">;
    sessionId: import("convex/values").GenericId<"stream_sessions">;
    stepId: string;
    optionKey: string;
}, Promise<{
    id: string;
    session: string;
    step_id: string;
    option_key: string;
    option_meta: any;
    votedby: string | null;
    created: number;
    updated: number;
} | null>>;
//# sourceMappingURL=streamVotes.d.ts.map