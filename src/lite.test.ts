import {expect, test} from "bun:test";
import {
    createChromeStorage,
    createDefaultStorage,
    createLiteClient,
    createMemoryStorage,
    createWebStorage,
    getRule,
    ZeroPasswordApiError,
} from "./lite";

const rule = {length: {min: 8}}

const fakeFetch = (handler: (url: string) => Response) => {
    const calls: string[] = []
    const fetcher = (async (input: string | URL | Request) => {
        calls.push(String(input))
        return handler(String(input))
    }) as typeof fetch
    return {calls, fetcher}
}

test("fetches a rule from the API and caches it", async () => {
    const {calls, fetcher} = fakeFetch(() => Response.json({domain: "nid.naver.com", rule}))
    const client = createLiteClient({apiBaseUrl: "https://api.example/", fetch: fetcher, storage: createMemoryStorage()})
    expect(await client.findRule("nid.naver.com")).toEqual({domain: "nid.naver.com", rule})
    expect(await client.getRule("nid.naver.com")).toEqual(rule)
    expect(calls).toEqual(["https://api.example/api/nid.naver.com"])
})

test("caches a 404 as no rule", async () => {
    const {calls, fetcher} = fakeFetch(() => Response.json({error: "not_found"}, {status: 404}))
    const client = createLiteClient({apiBaseUrl: "https://api.example", fetch: fetcher, storage: createMemoryStorage()})
    expect(await client.getRule("unknown.example")).toBeNull()
    expect(await client.getRule("unknown.example")).toBeNull()
    expect(calls.length).toBe(1)
})

test("refetches when the cached rule is older than maxAge", async () => {
    const storage = createMemoryStorage()
    storage.set("nid.naver.com", {match: null, fetchedAt: 0})
    const {calls, fetcher} = fakeFetch(() => Response.json({domain: "nid.naver.com", rule}))
    const client = createLiteClient({apiBaseUrl: "https://api.example", fetch: fetcher, storage})
    expect(await client.getRule("nid.naver.com")).toEqual(rule)
    expect(calls.length).toBe(1)
})

test("throws on server errors without caching", async () => {
    let status = 500
    const {calls, fetcher} = fakeFetch(() => status === 500 ? new Response("", {status}) : Response.json({domain: "a.example", rule}))
    const client = createLiteClient({apiBaseUrl: "https://api.example", fetch: fetcher, storage: createMemoryStorage()})
    await expect(client.getRule("a.example")).rejects.toBeInstanceOf(ZeroPasswordApiError)
    status = 200
    expect(await client.getRule("a.example")).toEqual(rule)
    expect(calls.length).toBe(2)
})

test("uses the 0Password API by default", async () => {
    const {calls, fetcher} = fakeFetch(() => Response.json({domain: "nid.naver.com", rule}))
    const client = createLiteClient({fetch: fetcher, storage: createMemoryStorage()})
    await client.getRule("nid.naver.com")
    expect(calls).toEqual(["https://0password.startergate.dev/api/nid.naver.com"])
})

test("getRule can be used without creating a client", async () => {
    const original = globalThis.fetch
    const {calls, fetcher} = fakeFetch(() => Response.json({domain: "nid.naver.com", rule}))
    globalThis.fetch = fetcher
    try {
        expect(await getRule("nid.naver.com")).toEqual(rule)
        expect(calls).toEqual(["https://0password.startergate.dev/api/nid.naver.com"])
    } finally {
        globalThis.fetch = original
    }
})

test("chrome storage keeps entries under a prefixed key", async () => {
    const items: Record<string, unknown> = {}
    const storage = createChromeStorage({
        get: async (key) => (key in items ? {[key]: items[key]} : {}),
        set: async (values) => {
            Object.assign(items, values)
        },
    })
    expect(await storage.get("a.example")).toBeUndefined()
    await storage.set("a.example", {match: null, fetchedAt: 1})
    expect(items).toEqual({"zero-password:rule:a.example": {match: null, fetchedAt: 1}})
    expect(await storage.get("a.example")).toEqual({match: null, fetchedAt: 1})
})

test("web storage round-trips entries and ignores broken values", async () => {
    const items = new Map<string, string>()
    const storage = createWebStorage({getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v)})
    await storage.set("a.example", {match: {domain: "a.example", rule}, fetchedAt: 1})
    expect(await storage.get("a.example")).toEqual({match: {domain: "a.example", rule}, fetchedAt: 1})
    items.set("zero-password:rule:b.example", "{broken")
    expect(await storage.get("b.example")).toBeUndefined()
})

test("default storage prefers chrome.storage.local", async () => {
    const scope = globalThis as { chrome?: unknown }
    const items: Record<string, unknown> = {}
    scope.chrome = {storage: {local: {get: async () => ({}), set: async (v: Record<string, unknown>) => void Object.assign(items, v)}}}
    try {
        await createDefaultStorage().set("a.example", {match: null, fetchedAt: 1})
        expect(Object.keys(items)).toEqual(["zero-password:rule:a.example"])
    } finally {
        delete scope.chrome
    }
})

test("normalizes the domain before fetching and caching", async () => {
    const {calls, fetcher} = fakeFetch(() => Response.json({domain: "www.coupang.com", rule}))
    const client = createLiteClient({apiBaseUrl: "https://api.example", fetch: fetcher, storage: createMemoryStorage()})
    expect(await client.findRule("Login.Coupang.com.")).toEqual({domain: "www.coupang.com", rule})
    expect(await client.findRule("login.coupang.com")).toEqual({domain: "www.coupang.com", rule})
    expect(calls).toEqual(["https://api.example/api/login.coupang.com"])
})

test("returns null for an invalid domain without a request", async () => {
    const {calls, fetcher} = fakeFetch(() => Response.json({domain: "a.example", rule}))
    const client = createLiteClient({apiBaseUrl: "https://api.example", fetch: fetcher, storage: createMemoryStorage()})
    expect(await client.findRule("../a.example")).toBeNull()
    expect(await client.getRule("localhost")).toBeNull()
    expect(calls).toEqual([])
})
