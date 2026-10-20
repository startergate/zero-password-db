import type {Rule, RuleMatch} from "./types.js";

export type * from "./types.js";

export type CachedRule = {
    match: RuleMatch | null // null records that the API has no rule for the domain
    fetchedAt: number
}

// Storage for rules fetched from the API. Pass a `chrome.storage` backed implementation in the extension.
export interface RuleStorage {
    get(domain: string): Promise<CachedRule | undefined> | CachedRule | undefined
    set(domain: string, value: CachedRule): Promise<void> | void
}

export const createMemoryStorage = (): RuleStorage => {
    const map = new Map<string, CachedRule>()
    return {
        get: (domain) => map.get(domain),
        set: (domain, value) => {
            map.set(domain, value)
        },
    }
}

export type LiteOptions = {
    apiBaseUrl: string // e.g. "https://0password.example.com"
    storage?: RuleStorage
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
export const createLiteClient = ({apiBaseUrl, storage = createMemoryStorage(), maxAge = DAY, fetch: fetcher = fetch}: LiteOptions) => {
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
