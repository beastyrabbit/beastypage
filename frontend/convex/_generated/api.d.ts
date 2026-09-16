/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as adoptionV2 from "../adoptionV2.js";
import type * as ancestryTree from "../ancestryTree.js";
import type * as catShares from "../catShares.js";
import type * as catStream from "../catStream.js";
import type * as catdex from "../catdex.js";
import type * as coinflipper from "../coinflipper.js";
import type * as collection from "../collection.js";
import type * as crons from "../crons.js";
import type * as dashSettings from "../dashSettings.js";
import type * as discord from "../discord.js";
import type * as discordAuth from "../discordAuth.js";
import type * as discordHttp from "../discordHttp.js";
import type * as discordUserConfigInternal from "../discordUserConfigInternal.js";
import type * as http from "../http.js";
import type * as imageService from "../imageService.js";
import type * as importer from "../importer.js";
import type * as init from "../init.js";
import type * as mapper from "../mapper.js";
import type * as paletteGeneratorSettings from "../paletteGeneratorSettings.js";
import type * as paletteGeneratorSettingsActions from "../paletteGeneratorSettingsActions.js";
import type * as perfectCats from "../perfectCats.js";
import type * as pixelatorSettings from "../pixelatorSettings.js";
import type * as previews from "../previews.js";
import type * as quickShare from "../quickShare.js";
import type * as quickShareHttp from "../quickShareHttp.js";
import type * as quickSharePolicy from "../quickSharePolicy.js";
import type * as rarities from "../rarities.js";
import type * as seasons from "../seasons.js";
import type * as singleCatSettings from "../singleCatSettings.js";
import type * as streamAccess from "../streamAccess.js";
import type * as streamParticipantsV2 from "../streamParticipantsV2.js";
import type * as streamSessionsV2 from "../streamSessionsV2.js";
import type * as streamVotesV2 from "../streamVotesV2.js";
import type * as streamWheel from "../streamWheel.js";
import type * as userVariants from "../userVariants.js";
import type * as users from "../users.js";
import type * as utils from "../utils.js";
import type * as wheel from "../wheel.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  adoptionV2: typeof adoptionV2;
  ancestryTree: typeof ancestryTree;
  catShares: typeof catShares;
  catStream: typeof catStream;
  catdex: typeof catdex;
  coinflipper: typeof coinflipper;
  collection: typeof collection;
  crons: typeof crons;
  dashSettings: typeof dashSettings;
  discord: typeof discord;
  discordAuth: typeof discordAuth;
  discordHttp: typeof discordHttp;
  discordUserConfigInternal: typeof discordUserConfigInternal;
  http: typeof http;
  imageService: typeof imageService;
  importer: typeof importer;
  init: typeof init;
  mapper: typeof mapper;
  paletteGeneratorSettings: typeof paletteGeneratorSettings;
  paletteGeneratorSettingsActions: typeof paletteGeneratorSettingsActions;
  perfectCats: typeof perfectCats;
  pixelatorSettings: typeof pixelatorSettings;
  previews: typeof previews;
  quickShare: typeof quickShare;
  quickShareHttp: typeof quickShareHttp;
  quickSharePolicy: typeof quickSharePolicy;
  rarities: typeof rarities;
  seasons: typeof seasons;
  singleCatSettings: typeof singleCatSettings;
  streamAccess: typeof streamAccess;
  streamParticipantsV2: typeof streamParticipantsV2;
  streamSessionsV2: typeof streamSessionsV2;
  streamVotesV2: typeof streamVotesV2;
  streamWheel: typeof streamWheel;
  userVariants: typeof userVariants;
  users: typeof users;
  utils: typeof utils;
  wheel: typeof wheel;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
