# 0Password: Password "rule" manager

This library provides password rules from websites across the internet.

Since this system does not save your password in any form, you can prevent every kind of password leak unless you leak it.

This library is provided in two forms, full and lite version.

- **Full** (`zero-password`): includes the complete database of password rules and reads it with `node:fs`. Used by the API server.
- **Lite** (`zero-password/lite`): includes no rule data. It fetches a rule from the API server when needed and keeps it in a storage you choose. It only uses `fetch`, so it can be bundled for browsers and extensions.

Both versions share the same types (`Rule`, `RuleMatch`, ...) and return `RuleMatch` (`{ domain, rule }`), where `domain` is the database entry that matched.

### Full

```ts
import getRuleFrom0PasswordDB, {findRule} from "zero-password";

getRuleFrom0PasswordDB("nid.naver.com") // Rule | null
findRule("daum.net")                    // { domain: "daum.net", rule } | null, `$ref` is resolved
```

### Lite

```ts
import {createLiteClient, type RuleStorage} from "zero-password/lite";

const client = createLiteClient({
    apiBaseUrl: "https://<api server>",
    // optional: defaults to an in-memory storage
    storage: chromeStorage satisfies RuleStorage,
    // optional: how long a fetched result stays valid, defaults to one day
    maxAge: 24 * 60 * 60 * 1000,
})

await client.getRule("nid.naver.com")  // Rule | null
await client.findRule("nid.naver.com") // RuleMatch | null
```

A domain the API has no rule for is cached as `null`. Network and server errors throw (`ZeroPasswordApiError` for non-404 responses) and are not cached.

A `chrome.storage` storage looks like this:

```ts
const chromeStorage: RuleStorage = {
    get: async (domain) => (await chrome.storage.local.get(`rule:${domain}`))[`rule:${domain}`],
    set: (domain, value) => chrome.storage.local.set({[`rule:${domain}`]: value}),
}
```

The lite version calls `GET {apiBaseUrl}/api/{domain}`, which answers `200 { domain, rule }` or `404 { error: "not_found" }` (see zero-password-api).

To install dependencies:

```bash
bun install
```

To test:

```bash
bun test
```

This project was created using `bun init` in bun v1.3.13. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
