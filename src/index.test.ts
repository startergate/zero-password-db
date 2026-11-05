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

test("matches www, parent domains and case variants to a database entry", () => {
    const coupang = getRule("www.coupang.com")
    expect(findRule("coupang.com")).toEqual({domain: "www.coupang.com", rule: coupang!})
    expect(findRule("login.coupang.com")).toEqual({domain: "www.coupang.com", rule: coupang!})
    expect(findRule("WWW.Coupang.com.")?.domain).toBe("www.coupang.com")
    expect(findRule("m.nid.naver.com")?.domain).toBe("nid.naver.com")
    expect(findRule("www.daum.net")).toEqual({domain: "daum.net", rule: getRule("accounts.kakao.com")!})
})

test("does not match unrelated domains under the same public suffix", () => {
    expect(findRule("other.co.kr")).toBeNull()
    expect(findRule("naver.com")).toBeNull()
})

test("rejects path traversal", () => {
    expect(findRule("../package.json")).toBeNull()
    expect(findRule("../databases/nid.naver.com")).toBeNull()
})
