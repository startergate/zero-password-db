import type {Rule, RuleMatch} from "./types.js";

export type * from "./types.js";

export type CachedRule = {
    match: RuleMatch | null // null records that the API has no rule for the domain
    fetchedAt: number
}

// Storage for rules fetched from the API.
export interface RuleStorage {
    get(domain: string): Promise<CachedRule | undefined> | CachedRule | undefined
    set(domain: string, value: CachedRule): Promise<void> | void
}

const KEY_PREFIX = 'zero-password:rule:'

type ChromeStorageArea = {
    get(key: string): Promise<Record<string, unknown>>
    set(items: Record<string, unknown>): Promise<void>
}

type WebStorage = {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

// Kept across browser restarts. Available in extension pages, service workers and content scripts.
export const createChromeStorage = (area: ChromeStorageArea): RuleStorage => ({
    get: async (domain) => (await area.get(KEY_PREFIX + domain))[KEY_PREFIX + domain] as CachedRule | undefined,
    set: (domain, value) => area.set({[KEY_PREFIX + domain]: value}),
})

// Kept across browser restarts, per origin. Not available in extension service workers.
export const createWebStorage = (storage: WebStorage): RuleStorage => ({
    get: (domain) => {
        const text = storage.getItem(KEY_PREFIX + domain)
        if (!text) return undefined
        try {
            return JSON.parse(text) as CachedRule
        } catch (e) {
            return undefined
        }
    },
    set: (domain, value) => {
        try {
            storage.setItem(KEY_PREFIX + domain, JSON.stringify(value))
        } catch (e) {
            // quota exceeded or storage disabled: skip caching
        }
    },
})

export const createMemoryStorage = (): RuleStorage => {
    const map = new Map<string, CachedRule>()
    return {
        get: (domain) => map.get(domain),
        set: (domain, value) => {
            map.set(domain, value)
        },
    }
}

// Picks the most persistent storage available: chrome.storage.local, then localStorage, then memory.
export const createDefaultStorage = (): RuleStorage => {
    const scope = globalThis as { chrome?: { storage?: { local?: ChromeStorageArea } }, localStorage?: WebStorage }
    const chromeLocal = scope.chrome?.storage?.local
    if (chromeLocal) return createChromeStorage(chromeLocal)
    try {
        if (scope.localStorage) return createWebStorage(scope.localStorage)
    } catch (e) {
        // localStorage access can throw when storage is blocked
    }
    return createMemoryStorage()
}

export const DEFAULT_API_BASE_URL = 'https://0password.startergate.dev'

export type LiteOptions = {
    apiBaseUrl?: string // defaults to DEFAULT_API_BASE_URL
    storage?: RuleStorage // defaults to createDefaultStorage()
    maxAge?: number // milliseconds a cached result stays valid, defaults to one day
    fetch?: typeof fetch
}

export class ZeroPasswordApiError extends Error {
    constructor(readonly status: number, message: string) {
        super(message)
        this.name = 'ZeroPasswordApiError'
    }
}

const DAY = 24 * 60 * 60 * 1000

// Lite version: has no rule data and fetches rules from zero-password-api when needed.
export const createLiteClient = ({apiBaseUrl = DEFAULT_API_BASE_URL, storage = createDefaultStorage(), maxAge = DAY, fetch: fetcher = fetch}: LiteOptions = {}) => {
    const baseUrl = apiBaseUrl.replace(/\/+$/, '')

    const fetchRule = async (domain: string): Promise<RuleMatch | null> => {
        const response = await fetcher(`${baseUrl}/api/${encodeURIComponent(domain)}`)
        if (response.status === 404) return null
        if (!response.ok) throw new ZeroPasswordApiError(response.status, `0Password API responded ${response.status}`)
        return await response.json() as RuleMatch
    }

    // Network and server errors are thrown and not cached, so the next call retries.
    const findRule = async (domain: string): Promise<RuleMatch | null> => {
        const cached = await storage.get(domain)
        if (cached && Date.now() - cached.fetchedAt < maxAge) return cached.match
        const match = await fetchRule(domain)
        await storage.set(domain, {match, fetchedAt: Date.now()})
        return match
    }

    const getRule = async (domain: string): Promise<Rule | null> => (await findRule(domain))?.rule ?? null

    return {findRule, getRule}
}

let defaultClient: ReturnType<typeof createLiteClient> | undefined
const getDefaultClient = () => defaultClient ??= createLiteClient()

// Shortcuts using a client with the default options.
export const findRule = (domain: string) => getDefaultClient().findRule(domain)
export const getRule = (domain: string) => getDefaultClient().getRule(domain)
