export declare const create: import("convex/server").RegisteredMutation<"internal", {
    catData: any;
}, Promise<{
    id: string;
}>>;
export declare const get: import("convex/server").RegisteredQuery<"internal", {
    id: import("convex/values").GenericId<"gatcha_cat_mapper">;
}, Promise<{
    id: string;
    cat_data: any;
    created: number;
    updated: number;
} | null>>;
//# sourceMappingURL=mapper.d.ts.map