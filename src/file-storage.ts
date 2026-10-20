import {mkdir, readFile, writeFile} from "node:fs/promises";
import {homedir} from "node:os";
import path from "node:path";
import type {CachedRule, RuleStorage} from "./lite-core.js";

export const defaultCacheDirectory = () =>
    path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), '.cache'), 'zero-password')

// Keeps one JSON file per domain. Write failures only skip caching.
export const createFileStorage = (directory: string = defaultCacheDirectory()): RuleStorage => {
    // encodeURIComponent keeps "/" and "\" out of the file name
    const fileOf = (domain: string) => path.join(directory, `${encodeURIComponent(domain)}.json`)
    return {
        get: async (domain) => {
            try {
                return JSON.parse(await readFile(fileOf(domain), 'utf8')) as CachedRule
            } catch (e) {
                return undefined
            }
        },
        set: async (domain, value) => {
            try {
                await mkdir(directory, {recursive: true})
                await writeFile(fileOf(domain), JSON.stringify(value))
            } catch (e) {
                // read-only or missing file system: skip caching
            }
        },
    }
}
