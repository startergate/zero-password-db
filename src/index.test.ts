import {expect, test} from "bun:test";
import {findRule, getRule} from "./index";

test("finds a rule by its database domain", () => {
    const match = findRule("nid.naver.com")
    expect(match?.domain).toBe("nid.naver.com")
    expect(match?.rule.length).toBeDefined()
})

test("follows $ref to the referenced rule", () => {
    expect(findRule("daum.net")).toEqual({domain: "daum.net", rule: getRule("accounts.kakao.com")!})
})

test("returns null for an unknown domain", () => {
    expect(findRule("unknown.example")).toBeNull()
    expect(getRule("unknown.example")).toBeNull()
})
