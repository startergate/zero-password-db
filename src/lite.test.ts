import {expect, test} from "bun:test";
import {createLiteClient, createMemoryStorage, ZeroPasswordApiError} from "./lite";

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
    const client = createLiteClient({apiBaseUrl: "https://api.example/", fetch: fetcher})
    expect(await client.findRule("nid.naver.com")).toEqual({domain: "nid.naver.com", rule})
    expect(await client.getRule("nid.naver.com")).toEqual(rule)
    expect(calls).toEqual(["https://api.example/api/nid.naver.com"])
})

test("caches a 404 as no rule", async () => {
    const {calls, fetcher} = fakeFetch(() => Response.json({error: "not_found"}, {status: 404}))
    const client = createLiteClient({apiBaseUrl: "https://api.example", fetch: fetcher})
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
    const client = createLiteClient({apiBaseUrl: "https://api.example", fetch: fetcher})
    await expect(client.getRule("a.example")).rejects.toBeInstanceOf(ZeroPasswordApiError)
    status = 200
    expect(await client.getRule("a.example")).toEqual(rule)
    expect(calls.length).toBe(2)
})
