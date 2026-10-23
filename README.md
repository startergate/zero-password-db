# 0Password: Password "rule" manager

This library provides password rules from websites across the internet.

Since this system does not save your password in any form, you can prevent every kind of password leak unless you leak it.

This library is provided in two forms, full and lite version.

- **Full** (`zero-password`): includes the complete database of password rules and reads it with `node:fs`. Used by the API server.
- **Lite** (`zero-password/lite`): includes no rule data. It fetches a rule from the API server when needed and keeps it in a storage you choose. It only uses `fetch`, so it can be bundled for browsers and extensions.

Both versions share the same types (`Rule`, `RuleMatch`, ...) and return `RuleMatch` (`{ domain, rule }`), where `domain` is the database entry that matched.

### Domain matching

Pass a host name such as `location.hostname`. It is lowercased, and anything that is not a host name (paths, `../`, ports, single labels like `localhost`) finds no rule.
A host name is matched against the database in this order, and `RuleMatch.domain` tells which entry matched:

1. the host itself (`login.coupang.com`)
2. its parent domains, down to the registrable domain (`coupang.com`); multi-label public suffixes like `co.kr` are never crossed
3. `www.` + the registrable domain (`www.coupang.com`)

`normalizeDomain(host)` and `candidateDomains(host)` are exported from both versions. The lite version sends the normalized host name to the API, which does the matching.

### Full

```ts
import {getRule, findRule} from "zero-password";

getRule("nid.naver.com")  // Rule | null
findRule("daum.net")      // { domain: "daum.net", rule } | null, `$ref` is resolved
```

### Lite

The same functions, returning promises. They use the 0Password API (`https://0password.startergate.dev`) and cache fetched rules in the most persistent storage the runtime has:

| Runtime | Default storage |
| --- | --- |
| Chrome extension | `chrome.storage.local` |
| Browser | `localStorage`, or memory when it is blocked |
| Node, Bun, Deno | `chrome.storage.local` / `localStorage` when present, otherwise one JSON file per domain in `$XDG_CACHE_HOME/zero-password` (`~/.cache/zero-password`) |

The runtime is picked by the `browser` / `node` / `bun` / `deno` export conditions of `zero-password/lite`, so browser bundles never include `node:fs`.

```ts
import {getRule, findRule} from "zero-password/lite";

await getRule("nid.naver.com")  // Rule | null
await findRule("nid.naver.com") // RuleMatch | null
```

To change the defaults, create a client:

```ts
import {createLiteClient, createChromeStorage} from "zero-password/lite";

const {getRule, findRule} = createLiteClient({
    apiBaseUrl: "http://localhost:3000",            // default: https://0password.startergate.dev
    storage: createChromeStorage(chrome.storage.sync), // default: createDefaultStorage()
    maxAge: 24 * 60 * 60 * 1000,                    // how long a fetched result stays valid, default: one day
})
```

Available storages: `createChromeStorage(area)`, `createWebStorage(localStorage)`, `createMemoryStorage()`, `createFileStorage(directory?)` (Node, Bun and Deno only), or your own `RuleStorage` (`get(domain)` / `set(domain, value)`).

A domain the API has no rule for is cached as `null`. Network and server errors throw (`ZeroPasswordApiError` for non-404 responses) and are not cached.

The lite version calls `GET {apiBaseUrl}/api/{domain}`, which answers `200 { domain, rule }` or `404 { error: "not_found" }` (see zero-password-api).

### Rule format

Each `databases/<domain>/rule.json` is a `Rule`, or `{ "$ref": "<domain>" }` to reuse another entry's rule. Every field is optional.

| Field | Meaning |
| --- | --- |
| `alphabet` | `{ require, uppercase?, lowercase? }`: `require` asks for at least one letter of either case ("영문 필수"), and `uppercase` / `lowercase` are `{ allow, require, usable? }` for A-Z and a-z. |
| `number`, `specialCharacter` | `{ allow, require, usable? }` for 0-9 and the other printable ASCII characters (`!` to `~`). `usable` lists the only characters of that class the site accepts. |
| `combination` | `{ min, of? }`: at least `min` of the classes in `of`, from `uppercase`, `lowercase`, `number`, `specialCharacter` and `alphabet` (either case, counted once). The default is the first four. "영문·숫자·특수문자 중 2가지 이상" is `{ "min": 2, "of": ["alphabet", "number", "specialCharacter"] }`. |
| `forbidden` | `{ characters?, maxRepeat?, maxSequence?, id? }`: characters never allowed, the longest run of one character (`"aaa"` is 3), the longest ascending or descending run of letters or digits (`"abc"`, `"321"` are 3), and whether the account id may not appear. |
| `length` | `{ min?, max? }` in characters. |

Characters outside the four classes, such as spaces or non-ASCII letters, are never allowed.

`checkPassword(rule, password, { id? })` checks a password against a rule locally and returns the broken parts (`RuleViolation[]`, e.g. `["alphabet.require", "length.min"]`), or `[]`. It is exported from both versions and never sends the password anywhere.

To install dependencies:

```bash
bun install
```

To test:

```bash
bun test
```

This project was created using `bun init` in bun v1.3.13. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
