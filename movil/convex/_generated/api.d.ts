/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as http from "../http.js";
import type * as lib_enums from "../lib/enums.js";
import type * as lib_guardas from "../lib/guardas.js";
import type * as lib_permisos from "../lib/permisos.js";
import type * as lib_revenuecat from "../lib/revenuecat.js";
import type * as semillas from "../semillas.js";
import type * as suscripciones from "../suscripciones.js";
import type * as viewer from "../viewer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  http: typeof http;
  "lib/enums": typeof lib_enums;
  "lib/guardas": typeof lib_guardas;
  "lib/permisos": typeof lib_permisos;
  "lib/revenuecat": typeof lib_revenuecat;
  semillas: typeof semillas;
  suscripciones: typeof suscripciones;
  viewer: typeof viewer;
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
