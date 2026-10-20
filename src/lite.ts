import {createEntry, createMemoryStorage, pickBrowserStorage, type RuleStorage} from "./lite-core.js";

export * from "./lite-core.js";

// Browsers and extensions: chrome.storage.local, then localStorage, then memory.
export const createDefaultStorage = (): RuleStorage => pickBrowserStorage() ?? createMemoryStorage()

export const {createLiteClient, findRule, getRule} = createEntry(createDefaultStorage)
