import type { Doc } from "./_generated/dataModel.js";
type SeasonDoc = Doc<"card_season">;
export type SeasonPayload = ReturnType<typeof seasonRecordToClient>;
export declare const list: import("convex/server").RegisteredQuery<"internal", {}, Promise<{
    id: string;
    season_name: string;
    short_name: string | null;
    card_back: string | null;
    card_back_url: string | null;
    created: number;
    updated: number;
}[]>>;
export declare const getDoc: import("convex/server").RegisteredQuery<"internal", {
    id: import("convex/values").GenericId<"card_season">;
}, Promise<{
    _id: import("convex/values").GenericId<"card_season">;
    _creationTime: number;
    shortName?: string;
    cardBackStorageId?: import("convex/values").GenericId<"_storage">;
    cardBackName?: string;
    seasonName: string;
    createdAt: number;
    updatedAt: number;
} | null>>;
declare function seasonRecordToClient(doc: SeasonDoc): {
    id: string;
    season_name: string;
    short_name: string | null;
    card_back: string | null;
    card_back_url: string | null;
    created: number;
    updated: number;
};
export {};
//# sourceMappingURL=seasons.d.ts.map