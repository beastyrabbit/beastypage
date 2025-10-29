export declare const list: import("convex/server").RegisteredQuery<"internal", {
    viewerSession?: string;
    session: import("convex/values").GenericId<"stream_sessions">;
    limit: number;
}, Promise<{
    id: string;
    session: string;
    viewer_session: string | undefined;
    display_name: string;
    status: string;
    fingerprint: string | undefined;
    created: number;
    updated: number;
}[]>>;
export declare const get: import("convex/server").RegisteredQuery<"internal", {
    id: import("convex/values").GenericId<"stream_participants">;
}, Promise<{
    id: string;
    session: string;
    viewer_session: string | undefined;
    display_name: string;
    status: string;
    fingerprint: string | undefined;
    created: number;
    updated: number;
} | null>>;
export declare const create: import("convex/server").RegisteredMutation<"internal", {
    viewerSession?: string;
    fingerprint?: string;
    status: string;
    sessionId: import("convex/values").GenericId<"stream_sessions">;
    displayName: string;
}, Promise<{
    id: string;
    session: string;
    viewer_session: string | undefined;
    display_name: string;
    status: string;
    fingerprint: string | undefined;
    created: number;
    updated: number;
} | null>>;
export declare const update: import("convex/server").RegisteredMutation<"internal", {
    status?: string;
    viewerSession?: string;
    displayName?: string;
    fingerprint?: string;
    id: import("convex/values").GenericId<"stream_participants">;
}, Promise<{
    id: string;
    session: string;
    viewer_session: string | undefined;
    display_name: string;
    status: string;
    fingerprint: string | undefined;
    created: number;
    updated: number;
} | null>>;
//# sourceMappingURL=streamParticipants.d.ts.map