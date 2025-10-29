declare const _default: import("convex/server").SchemaDefinition<{
    card_season: import("convex/server").TableDefinition<import("convex/values").VObject<{
        shortName?: string;
        cardBackStorageId?: import("convex/values").GenericId<"_storage">;
        cardBackName?: string;
        seasonName: string;
        createdAt: number;
        updatedAt: number;
    }, {
        seasonName: import("convex/values").VString<string, "required">;
        shortName: import("convex/values").VString<string | undefined, "optional">;
        cardBackStorageId: import("convex/values").VId<import("convex/values").GenericId<"_storage"> | undefined, "optional">;
        cardBackName: import("convex/values").VString<string | undefined, "optional">;
        createdAt: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "seasonName" | "shortName" | "cardBackStorageId" | "cardBackName" | "createdAt" | "updatedAt">, {
        byName: ["seasonName", "_creationTime"];
        byShort: ["shortName", "_creationTime"];
    }, {}, {}>;
    rarity: import("convex/server").TableDefinition<import("convex/values").VObject<{
        stars?: number;
        createdAt: number;
        updatedAt: number;
        rarityName: string;
    }, {
        rarityName: import("convex/values").VString<string, "required">;
        stars: import("convex/values").VFloat64<number | undefined, "optional">;
        createdAt: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "createdAt" | "updatedAt" | "rarityName" | "stars">, {
        byName: ["rarityName", "_creationTime"];
    }, {}, {}>;
    catdex: import("convex/server").TableDefinition<import("convex/values").VObject<{
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
    }, {
        twitchUserName: import("convex/values").VString<string, "required">;
        catName: import("convex/values").VString<string, "required">;
        seasonId: import("convex/values").VId<import("convex/values").GenericId<"card_season">, "required">;
        rarityId: import("convex/values").VId<import("convex/values").GenericId<"rarity">, "required">;
        cardNumber: import("convex/values").VString<string | undefined, "optional">;
        approved: import("convex/values").VBoolean<boolean, "required">;
        defaultCardStorageId: import("convex/values").VId<import("convex/values").GenericId<"_storage"> | undefined, "optional">;
        defaultCardName: import("convex/values").VString<string | undefined, "optional">;
        customCardStorageId: import("convex/values").VId<import("convex/values").GenericId<"_storage"> | undefined, "optional">;
        customCardName: import("convex/values").VString<string | undefined, "optional">;
        createdAt: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "createdAt" | "updatedAt" | "twitchUserName" | "catName" | "seasonId" | "rarityId" | "cardNumber" | "approved" | "defaultCardStorageId" | "defaultCardName" | "customCardStorageId" | "customCardName">, {
        bySeason: ["seasonId", "_creationTime"];
        byRarity: ["rarityId", "_creationTime"];
        byApproval: ["approved", "_creationTime"];
        byOwner: ["twitchUserName", "_creationTime"];
    }, {}, {}>;
    collection: import("convex/server").TableDefinition<import("convex/values").VObject<{
        blurImgStorageId?: import("convex/values").GenericId<"_storage">;
        blurImgName?: string;
        previewImgStorageId?: import("convex/values").GenericId<"_storage">;
        previewImgName?: string;
        fullImgStorageId?: import("convex/values").GenericId<"_storage">;
        fullImgName?: string;
        createdAt: number;
        updatedAt: number;
        artistName: string;
        animal: string;
        link: string;
    }, {
        artistName: import("convex/values").VString<string, "required">;
        animal: import("convex/values").VString<string, "required">;
        link: import("convex/values").VString<string, "required">;
        blurImgStorageId: import("convex/values").VId<import("convex/values").GenericId<"_storage"> | undefined, "optional">;
        blurImgName: import("convex/values").VString<string | undefined, "optional">;
        previewImgStorageId: import("convex/values").VId<import("convex/values").GenericId<"_storage"> | undefined, "optional">;
        previewImgName: import("convex/values").VString<string | undefined, "optional">;
        fullImgStorageId: import("convex/values").VId<import("convex/values").GenericId<"_storage"> | undefined, "optional">;
        fullImgName: import("convex/values").VString<string | undefined, "optional">;
        createdAt: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "createdAt" | "updatedAt" | "artistName" | "animal" | "link" | "blurImgStorageId" | "blurImgName" | "previewImgStorageId" | "previewImgName" | "fullImgStorageId" | "fullImgName">, {
        byArtist: ["artistName", "_creationTime"];
    }, {}, {}>;
    gatcha_cat_mapper: import("convex/server").TableDefinition<import("convex/values").VObject<{
        createdAt: number;
        updatedAt: number;
        catData: any;
    }, {
        catData: import("convex/values").VAny<any, "required", string>;
        createdAt: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "createdAt" | "updatedAt" | "catData" | `catData.${string}`>, {}, {}, {}>;
    stream_sessions: import("convex/server").TableDefinition<import("convex/values").VObject<{
        currentStep?: string;
        stepIndex?: number;
        stepHistory?: any;
        params?: any;
        allowRepeatIps?: boolean;
        createdAt: number;
        updatedAt: number;
        viewerKey: string;
        status: string;
    }, {
        viewerKey: import("convex/values").VString<string, "required">;
        status: import("convex/values").VString<string, "required">;
        currentStep: import("convex/values").VString<string | undefined, "optional">;
        stepIndex: import("convex/values").VFloat64<number | undefined, "optional">;
        stepHistory: import("convex/values").VAny<any, "optional", string>;
        params: import("convex/values").VAny<any, "optional", string>;
        allowRepeatIps: import("convex/values").VBoolean<boolean | undefined, "optional">;
        createdAt: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "createdAt" | "updatedAt" | "viewerKey" | "status" | "currentStep" | "stepIndex" | "stepHistory" | "params" | "allowRepeatIps" | `stepHistory.${string}` | `params.${string}`>, {
        byViewerKey: ["viewerKey", "_creationTime"];
        byStatus: ["status", "_creationTime"];
    }, {}, {}>;
    stream_participants: import("convex/server").TableDefinition<import("convex/values").VObject<{
        viewerSession?: string;
        fingerprint?: string;
        createdAt: number;
        updatedAt: number;
        status: string;
        sessionId: import("convex/values").GenericId<"stream_sessions">;
        displayName: string;
    }, {
        sessionId: import("convex/values").VId<import("convex/values").GenericId<"stream_sessions">, "required">;
        viewerSession: import("convex/values").VString<string | undefined, "optional">;
        displayName: import("convex/values").VString<string, "required">;
        status: import("convex/values").VString<string, "required">;
        fingerprint: import("convex/values").VString<string | undefined, "optional">;
        createdAt: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "createdAt" | "updatedAt" | "status" | "sessionId" | "viewerSession" | "displayName" | "fingerprint">, {
        bySession: ["sessionId", "_creationTime"];
        byViewerSession: ["viewerSession", "_creationTime"];
    }, {}, {}>;
    stream_votes: import("convex/server").TableDefinition<import("convex/values").VObject<{
        optionMeta?: any;
        votedBy?: import("convex/values").GenericId<"stream_participants">;
        createdAt: number;
        updatedAt: number;
        sessionId: import("convex/values").GenericId<"stream_sessions">;
        stepId: string;
        optionKey: string;
    }, {
        sessionId: import("convex/values").VId<import("convex/values").GenericId<"stream_sessions">, "required">;
        stepId: import("convex/values").VString<string, "required">;
        optionKey: import("convex/values").VString<string, "required">;
        optionMeta: import("convex/values").VAny<any, "optional", string>;
        votedBy: import("convex/values").VId<import("convex/values").GenericId<"stream_participants"> | undefined, "optional">;
        createdAt: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "createdAt" | "updatedAt" | "sessionId" | "stepId" | "optionKey" | "optionMeta" | "votedBy" | `optionMeta.${string}`>, {
        bySession: ["sessionId", "_creationTime"];
        byStep: ["sessionId", "stepId", "_creationTime"];
    }, {}, {}>;
}, true>;
export default _default;
//# sourceMappingURL=schema.d.ts.map