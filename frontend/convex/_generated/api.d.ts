/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adoption from "../adoption.js";
import type * as catShares from "../catShares.js";
import type * as catdex from "../catdex.js";
import type * as coinflipper from "../coinflipper.js";
import type * as collection from "../collection.js";
import type * as crons from "../crons.js";
import type * as discord from "../discord.js";
import type * as imageService from "../imageService.js";
import type * as importer from "../importer.js";
import type * as init from "../init.js";
import type * as mapper from "../mapper.js";
import type * as perfectCats from "../perfectCats.js";
import type * as previews from "../previews.js";
import type * as rarities from "../rarities.js";
import type * as seasons from "../seasons.js";
import type * as singleCatSettings from "../singleCatSettings.js";
import type * as streamParticipants from "../streamParticipants.js";
import type * as streamSessions from "../streamSessions.js";
import type * as streamVotes from "../streamVotes.js";
import type * as utils from "../utils.js";
import type * as wheel from "../wheel.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adoption: typeof adoption;
  catShares: typeof catShares;
  catdex: typeof catdex;
  coinflipper: typeof coinflipper;
  collection: typeof collection;
  crons: typeof crons;
  discord: typeof discord;
  imageService: typeof imageService;
  importer: typeof importer;
  init: typeof init;
  mapper: typeof mapper;
  perfectCats: typeof perfectCats;
  previews: typeof previews;
  rarities: typeof rarities;
  seasons: typeof seasons;
  singleCatSettings: typeof singleCatSettings;
  streamParticipants: typeof streamParticipants;
  streamSessions: typeof streamSessions;
  streamVotes: typeof streamVotes;
  utils: typeof utils;
  wheel: typeof wheel;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
