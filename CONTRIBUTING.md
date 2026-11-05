# Contributing password rules

0Password shows each site's password rule on its login and sign-up pages. Every rule lives in `databases/<domain>/rule.json`.
This guide explains how to pick the domain, write the rule and get it merged.

There are two ways to contribute a rule:

- **Open a rule request issue** (easiest). Fill the [Password rule request](https://github.com/startergate/zero-password-db/issues/new?template=rule-request.yml) form and a pull request is opened for you. See [Rule request issues](#rule-request-issues).
- **Open a pull request yourself.** Add or edit `databases/<domain>/rule.json` on a branch, run `bun test`, and open a pull request to `develop`.

Never put a real password in an issue, a pull request or a rule.

## Choosing the domain

The folder name is the host name of the page where the password is set: the sign-up page or the password change page. Open that page and take the host from the address bar.

- Write only the host name, lowercased: `nid.naver.com`, not `https://nid.naver.com/user2/join`.
- The name must already be normalized (lowercase, no trailing dot, no port). `bun test` checks this.

The libraries match a page's host against the database in this order, and use the first entry that exists:

1. the host itself (`login.coupang.com`)
2. its parent domains, down to the registrable domain (`coupang.com`). Multi-label public suffixes like `co.kr` are never crossed.
3. `www.` + the registrable domain (`www.coupang.com`)

So pick the most general name that still has one rule:

- If the whole site shares one account system, use the registrable domain or the `www.` name. `www.coupang.com` also covers `login.coupang.com`.
- If accounts are handled on a separate host whose rule differs from the rest of the site, use that host, e.g. `accounts.google.com` or `nid.naver.com`.
- Do not add an entry for a host that is already covered by a parent or `www.` entry with the same rule.

## Writing `rule.json`

A rule is a JSON object. Every field is optional, and a field that is left out means the site does not restrict it. The full field reference is in the [README](README.md#rule-format); the types are in [`src/types.ts`](src/types.ts).

| Field | Use it for |
| --- | --- |
| `alphabet` | Letters. `require` is "at least one letter of either case". `uppercase` / `lowercase` are `{ allow, require, usable? }` per case. |
| `number`, `specialCharacter` | `{ allow, require, usable? }`. `usable` lists the only characters of that class the site accepts. |
| `combination` | "N kinds or more": `{ min, of? }`. |
| `forbidden` | Characters never allowed, the longest repeat (`maxRepeat`) or sequence (`maxSequence`), and whether the account id may appear (`id`). |
| `length` | `{ min?, max? }` in characters. |

Write down only what the site actually says. Do not guess restrictions it does not state.

### Translating the site's guidance

Start from the exact text on the sign-up or password change page. Some common phrasings:

**"8~16자 영문 대소문자, 숫자, 특수문자를 사용하세요."** (letters, numbers and special characters may be used, 8-16 characters)

```json
{
  "alphabet": {
    "require": false,
    "uppercase": { "allow": true, "require": false },
    "lowercase": { "allow": true, "require": false }
  },
  "number": { "allow": true, "require": false },
  "specialCharacter": { "allow": true, "require": false },
  "length": { "min": 8, "max": 16 }
}
```

**"영문, 숫자, 특수문자 중 2가지 이상 조합하여 8~20자"** (at least two of letters, numbers and special characters)

```json
{
  "combination": { "min": 2, "of": ["alphabet", "number", "specialCharacter"] },
  "length": { "min": 8, "max": 20 }
}
```

Use `"alphabet"` in `of` when the site counts letters as one kind. Leave `of` out only when it counts uppercase and lowercase separately (the default is `uppercase`, `lowercase`, `number`, `specialCharacter`).

**"영문, 숫자, 특수문자를 모두 포함하여 10자 이상"** (letters, numbers and special characters are all required)

```json
{
  "alphabet": { "require": true },
  "number": { "allow": true, "require": true },
  "specialCharacter": { "allow": true, "require": true },
  "length": { "min": 10 }
}
```

`alphabet.require` means one letter of either case. Use `uppercase.require` / `lowercase.require` only when the site asks for a specific case ("대문자 1자 이상").

**"특수문자는 !@#$%^&*만 사용 가능"** (only these special characters)

```json
{
  "specialCharacter": { "allow": true, "require": false, "usable": "!@#$%^&*" }
}
```

**"동일한 문자 3번 이상 연속 사용 불가, 연속된 숫자·문자 3자리 이상 불가, 아이디 포함 불가"**

```json
{
  "forbidden": { "maxRepeat": 2, "maxSequence": 2, "id": true }
}
```

`maxRepeat` and `maxSequence` are the longest run that is still allowed. "3번 이상 불가" means 2 is the most allowed.

Rules for the classes:

- Characters are ASCII only. Letters are A-Z and a-z, numbers 0-9, and `specialCharacter` is every other printable character from `!` to `~`. Spaces and non-ASCII letters are never allowed, so they need no rule.
- A class with `"require": true` must also have `"allow": true`.
- `usable` may only contain characters of its own class, without duplicates.

Format the file with two-space indentation and a trailing newline, like the existing files.

## Reusing a rule with `$ref`

When several sites share one account system, write the rule once and point the others to it:

```json
{ "$ref": "accounts.kakao.com" }
```

`databases/daum.net/rule.json` does this, because Daum accounts are Kakao accounts.

- `$ref` must be the only key in the file.
- It names another folder in `databases/` that holds a real rule. A `$ref` to another `$ref` is not allowed; point to the final rule instead.
- Use `$ref` only when the sites really share accounts. Two sites that happen to have the same rule today should each get their own file, since either may change.

## Checking your rule

```bash
bun install
bun test
```

`src/rules.test.ts` checks every `rule.json`:

- the folder name is a normalized domain
- the rule matches the `Rule` schema (no unknown keys, correct types, `require` only when `allow`, valid `usable`, `combination`, `forbidden` and `length`)
- some password can satisfy the rule, so the rule is not self-contradicting
- a `$ref` points to an existing rule that is not another `$ref`

In the pull request, include the site's guidance text and the URL of the page you checked. A screenshot helps reviewers.

## Rule request issues

The [Password rule request](https://github.com/startergate/zero-password-db/issues/new?template=rule-request.yml) form (`.github/ISSUE_TEMPLATE/rule-request.yml`) asks for:

| Field | |
| --- | --- |
| Domain | The host name, chosen as in [Choosing the domain](#choosing-the-domain). |
| Request type | "Add a new site" or "Change an existing rule". |
| Password guidance on the site | The guidance text exactly as the site shows it. |
| Page checked | The URL of the page the guidance comes from. |
| Screenshots | Optional. |
| Rule JSON | The whole `rule.json`, or a `$ref`. |

When the issue is opened, the [Rule request workflow](.github/workflows/rule-request.yml) runs:

1. `scripts/rule-request.ts` reads the issue and checks it: the domain must be a host name, the request type must match whether the domain already has a rule, and the JSON must be a valid rule or `$ref`. It then writes `databases/<domain>/rule.json`.
2. `bun test src/rules.test.ts` runs against the new file.
3. The change is committed to `feature/rule-request-<issue number>` and a pull request to `develop` is opened. The workflow comments the link on the issue.

If a check fails, the workflow comments the problems on the issue instead. Edit the issue to fix them and the workflow runs again. Editing the issue after the pull request is open rewrites the branch from `develop` and updates the same pull request.

The workflow only handles issues whose title starts with `[Rule]` and that were made from the form, so keep the `[Rule]` prefix when you edit the title.

### For maintainers

- The workflow needs **Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"** to be enabled. Without it, the pull request step fails and the workflow comments a link to the failed run on the issue.
- Review the generated pull request against the guidance and screenshots in the issue before merging. The workflow only checks that the rule is well formed, not that it matches the site.
- Pull requests opened with the workflow's token do not trigger other workflows. Run `bun test` locally if you change the branch.
- The base is `develop`, so merging does not close the issue. Close it by hand after merging.

## Branches

This repository uses git flow without release branches: `main` is released, `develop` is where work is merged, and changes go on `feature/<name>` branches opened against `develop`. Fixes to a release go on `hotfix/<name>` from `main` and are merged into both `main` and `develop`.
