import type { Id, TableNames, SystemTableNames } from "./_generated/dataModel.js";
export type AnyId = Id<TableNames | SystemTableNames>;
export declare function docIdToString(id: AnyId): string;
export declare function toId<TableName extends TableNames | SystemTableNames>(_table: TableName, value: string | Id<TableName>): Id<TableName>;
export declare function buildFileUrl(collection: string, id: string, filename: string): string;
//# sourceMappingURL=utils.d.ts.map