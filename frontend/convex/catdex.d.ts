import type { Doc } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
type CatdexDoc = Doc<"catdex">;
export type CatdexPayload = Awaited<ReturnType<typeof catdexRecordToClient>>;
export declare const list: import("convex/server").RegisteredQuery<"internal", {
    approved?: boolean;
}, Promise<{
    id: string;
    twitch_user_name: string;
    cat_name: string;
    card_number: string | null;
    approved: boolean;
    default_card: string | null;
    default_card_url: string | null;
    custom_card: string | null;
    custom_card_url: string | null;
    season: {
        id: string;
        season_name: string;
        short_name: string | null;
        card_back: string | null;
        card_back_url: string | null;
        created: number;
        updated: number;
    } | null;
    rarity: {
        id: string;
        rarity_name: string;
        stars: number | null;
        created: number;
        updated: number;
    } | null;
    created: number;
    updated: number;
}[]>>;
export declare const pendingCount: import("convex/server").RegisteredQuery<"internal", {}, Promise<number>>;
export declare const get: import("convex/server").RegisteredQuery<"internal", {
    id: import("convex/values").GenericId<"catdex">;
}, Promise<{
    id: string;
    twitch_user_name: string;
    cat_name: string;
    card_number: string | null;
    approved: boolean;
    default_card: string | null;
    default_card_url: string | null;
    custom_card: string | null;
    custom_card_url: string | null;
    season: {
        id: string;
        season_name: string;
        short_name: string | null;
        card_back: string | null;
        card_back_url: string | null;
        created: number;
        updated: number;
    } | null;
    rarity: {
        id: string;
        rarity_name: string;
        stars: number | null;
        created: number;
        updated: number;
    } | null;
    created: number;
    updated: number;
} | null>>;
export declare const getDoc: import("convex/server").RegisteredQuery<"internal", {
    id: import("convex/values").GenericId<"catdex">;
}, Promise<{
    _id: import("convex/values").GenericId<"catdex">;
    _creationTime: number;
    cardNumber?: string;
    defaultCardStorageId?: import("convex/values").GenericId<"_storage">;
    defaultCardName?: string;
    customCardStorageId?: import("convex/values").GenericId<"_storage">;
    customCardName?: string;
    createdAt: number;
    updatedAt: number;
    twitchUserName: string;
    catName: string;
    seasonId: import("convex/values").GenericId<"card_season">;
    rarityId: import("convex/values").GenericId<"rarity">;
    approved: boolean;
} | null>>;
export declare const create: import("convex/server").RegisteredMutation<"internal", {
    cardNumber?: string;
    customCard?: {
        storageId: import("convex/values").GenericId<"_storage">;
        fileName: string;
    };
    twitchUserName: string;
    catName: string;
    seasonId: import("convex/values").GenericId<"card_season">;
    rarityId: import("convex/values").GenericId<"rarity">;
    defaultCard: {
        storageId: import("convex/values").GenericId<"_storage">;
        fileName: string;
    };
}, Promise<{
    id: string;
    twitch_user_name: string;
    cat_name: string;
    card_number: string | null;
    approved: boolean;
    default_card: string | null;
    default_card_url: string | null;
    custom_card: string | null;
    custom_card_url: string | null;
    season: {
        id: string;
        season_name: string;
        short_name: string | null;
        card_back: string | null;
        card_back_url: string | null;
        created: number;
        updated: number;
    } | null;
    rarity: {
        id: string;
        rarity_name: string;
        stars: number | null;
        created: number;
        updated: number;
    } | null;
    created: number;
    updated: number;
}>>;
declare function catdexRecordToClient(db: QueryCtx["db"], doc: CatdexDoc): Promise<{
    id: string;
    twitch_user_name: string;
    cat_name: string;
    card_number: string | null;
    approved: boolean;
    default_card: string | null;
    default_card_url: string | null;
    custom_card: string | null;
    custom_card_url: string | null;
    season: {
        id: string;
        season_name: string;
        short_name: string | null;
        card_back: string | null;
        card_back_url: string | null;
        created: number;
        updated: number;
    } | null;
    rarity: {
        id: string;
        rarity_name: string;
        stars: number | null;
        created: number;
        updated: number;
    } | null;
    created: number;
    updated: number;
}>;
export {};
//# sourceMappingURL=catdex.d.ts.map