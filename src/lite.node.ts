import {createEntry, pickBrowserStorage, type RuleStorage} from "./lite-core.js";
import {createFileStorage} from "./file-storage.js";

export * from "./lite-core.js";
export {createFileStorage, defaultCacheDirectory} from "./file-storage.js";

// Node, Bun and Deno: chrome.storage.local or localStorage when present, otherwise files under defaultCacheDirectory().
export const createDefaultStorage = (): RuleStorage => pickBrowserStorage() ?? createFileStorage()

export const {createLiteClient, findRule, getRule} = createEntry(createDefaultStorage)
