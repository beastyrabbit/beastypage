import type { Doc } from "./_generated/dataModel.js";
type RarityDoc = Doc<"rarity">;
export type RarityPayload = ReturnType<typeof rarityRecordToClient>;
export declare const list: import("convex/server").RegisteredQuery<"internal", {}, Promise<{
    id: string;
    rarity_name: string;
    stars: number | null;
    created: number;
    updated: number;
}[]>>;
declare function rarityRecordToClient(doc: RarityDoc): {
    id: string;
    rarity_name: string;
    stars: number | null;
    created: number;
    updated: number;
};
export {};
//# sourceMappingURL=rarities.d.ts.map