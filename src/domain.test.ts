import {expect, test} from "bun:test";
import {candidateDomains, normalizeDomain} from "./domain";

test("normalizes case, whitespace and a trailing dot", () => {
    expect(normalizeDomain(" NID.Naver.com. ")).toBe("nid.naver.com")
})

test("rejects anything that is not a host name", () => {
    for (const input of ["", "localhost", "../databases", "a/../b.com", "a..com", "-a.com", "a-.com", "a.com:443",
        "https://a.com", "a b.com", "네이버.com", `${"a".repeat(64)}.com`, `${"a.".repeat(127)}com`]) {
        expect(normalizeDomain(input)).toBeNull()
        expect(candidateDomains(input)).toEqual([])
    }
})

test("tries parent domains down to the registrable domain, then www", () => {
    expect(candidateDomains("m.login.coupang.com")).toEqual(["m.login.coupang.com", "login.coupang.com", "coupang.com", "www.coupang.com"])
    expect(candidateDomains("coupang.com")).toEqual(["coupang.com", "www.coupang.com"])
    expect(candidateDomains("www.coupang.com")).toEqual(["www.coupang.com", "coupang.com"])
})

test("does not go above a multi-label public suffix", () => {
    expect(candidateDomains("login.11st.co.kr")).toEqual(["login.11st.co.kr", "11st.co.kr", "www.11st.co.kr"])
    expect(candidateDomains("co.kr")).toEqual(["co.kr"])
})

test("does not split IP addresses", () => {
    expect(candidateDomains("192.168.0.1")).toEqual(["192.168.0.1"])
})
