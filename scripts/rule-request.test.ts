import {expect, test} from "bun:test";
import {buildRule, parseIssueBody} from "./rule-request";

const body = (fields: Record<string, string>) => Object.entries(fields)
    .map(([label, value]) => `### ${label}\n\n${value}`).join('\n\n')

const request = (fields: Record<string, string>) => buildRule(parseIssueBody(body({
    'Domain': 'example.com',
    'Request type': 'Add a new site',
    'Password guidance on the site': '영문, 숫자 포함 8~16자',
    'Page checked': '_No response_',
    'Rule JSON': '```json\n{"length": {"min": 8, "max": 16}}\n```',
    ...fields,
})))

test("parses issue form sections", () => {
    expect(parseIssueBody("### Domain\n\nExample.com\n\n### Page checked\n\n_No response_\n"))
        .toEqual({'Domain': 'Example.com', 'Page checked': ''})
})

test("builds a new rule file", () => {
    expect(request({'Domain': 'Example.COM'})).toEqual({
        domain: 'example.com',
        action: 'add',
        json: '{\n  "length": {\n    "min": 8,\n    "max": 16\n  }\n}\n',
    })
    expect(request({'Rule JSON': '```json\n```json\n{"$ref": "accounts.kakao.com"}\n```\n```'}))
        .toMatchObject({domain: 'example.com', action: 'add'})
})

test("updates an existing rule", () => {
    expect(request({'Domain': 'nid.naver.com', 'Request type': 'Change an existing rule'}))
        .toMatchObject({domain: 'nid.naver.com', action: 'update'})
})

test("reports problems", () => {
    expect(request({'Domain': '../etc'})).toMatchObject({problems: ['**Domain**: `../etc` is not a host name such as `nid.naver.com`.']})
    expect(request({'Domain': 'nid.naver.com'})).toMatchObject({problems: [expect.stringContaining('already has a rule')]})
    expect(request({'Request type': 'Change an existing rule'})).toMatchObject({problems: [expect.stringContaining('has no rule yet')]})
    expect(request({'Rule JSON': '{"length": '})).toMatchObject({problems: [expect.stringContaining('not valid JSON')]})
    expect(request({'Rule JSON': '{"lenght": {"min": 8}}'})).toEqual({problems: ['**Rule JSON**: `lenght: unknown key`']})
    expect(request({'Rule JSON': '{"$ref": "daum.net"}'})).toMatchObject({problems: [expect.stringContaining('is itself a `$ref`')]})
    expect(request({'Rule JSON': '{"$ref": "nowhere.example"}'})).toMatchObject({problems: [expect.stringContaining('has no rule')]})
})

test("refuses a change that changes nothing", async () => {
    const current = await Bun.file(`${import.meta.dir}/../databases/nid.naver.com/rule.json`).text()
    expect(request({'Domain': 'nid.naver.com', 'Request type': 'Change an existing rule', 'Rule JSON': current}))
        .toMatchObject({problems: [expect.stringContaining('nothing to change')]})
})
