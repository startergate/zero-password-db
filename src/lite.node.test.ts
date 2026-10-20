import {afterEach, beforeEach, expect, test} from "bun:test";
import {mkdtemp, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createFileStorage, createLiteClient, defaultCacheDirectory} from "./lite.node";

const rule = {length: {min: 8}}
let directory: string

beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "zero-password-"))
})

afterEach(async () => {
    await rm(directory, {recursive: true, force: true})
})

test("file storage round-trips entries across instances", async () => {
    await createFileStorage(directory).set("a.example", {match: {domain: "a.example", rule}, fetchedAt: 1})
    expect(await createFileStorage(directory).get("a.example")).toEqual({match: {domain: "a.example", rule}, fetchedAt: 1})
})

test("file storage keeps path separators out of file names", async () => {
    await createFileStorage(directory).set("../escape", {match: null, fetchedAt: 1})
    expect(await readdir(directory)).toEqual(["..%2Fescape.json"])
})

test("file storage ignores missing and broken files", async () => {
    const storage = createFileStorage(directory)
    expect(await storage.get("missing.example")).toBeUndefined()
    await writeFile(path.join(directory, "b.example.json"), "{broken")
    expect(await storage.get("b.example")).toBeUndefined()
})

test("file storage skips caching when the directory cannot be written", async () => {
    const file = path.join(directory, "not-a-directory")
    await writeFile(file, "")
    const storage = createFileStorage(path.join(file, "cache"))
    await storage.set("a.example", {match: null, fetchedAt: 1})
    expect(await storage.get("a.example")).toBeUndefined()
})

test("default cache directory follows XDG_CACHE_HOME", () => {
    const original = process.env.XDG_CACHE_HOME
    process.env.XDG_CACHE_HOME = "/cache"
    try {
        expect(defaultCacheDirectory()).toBe(path.join("/cache", "zero-password"))
    } finally {
        if (original === undefined) delete process.env.XDG_CACHE_HOME
        else process.env.XDG_CACHE_HOME = original
    }
})

test("node client caches fetched rules in files by default", async () => {
    const original = process.env.XDG_CACHE_HOME
    process.env.XDG_CACHE_HOME = directory
    let calls = 0
    const fetcher = (async () => {
        calls++
        return Response.json({domain: "a.example", rule})
    }) as unknown as typeof fetch
    try {
        expect(await createLiteClient({fetch: fetcher}).getRule("a.example")).toEqual(rule)
        // a new client, as after a restart, reads the cached file instead of fetching
        expect(await createLiteClient({fetch: fetcher}).getRule("a.example")).toEqual(rule)
        expect(calls).toBe(1)
        expect(await readdir(path.join(directory, "zero-password"))).toEqual(["a.example.json"])
    } finally {
        if (original === undefined) delete process.env.XDG_CACHE_HOME
        else process.env.XDG_CACHE_HOME = original
    }
})
