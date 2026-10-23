import {expect, test} from "bun:test";
import {checkPassword, getRule} from "./index";
import type {Rule} from "./types";

test("accepts a password that satisfies the rule", () => {
    expect(checkPassword({length: {min: 8, max: 16}}, "abcd1234")).toEqual([])
})

test("checks length in characters", () => {
    expect(checkPassword({length: {min: 8}}, "abc")).toEqual(["length.min"])
    expect(checkPassword({length: {max: 4}}, "abcde")).toEqual(["length.max"])
})

test("checks required and disallowed character classes", () => {
    const rule: Rule = {
        alphabetUppercase: {allow: true, require: true},
        number: {allow: false, require: false},
    }
    expect(checkPassword(rule, "abc1")).toEqual(["number.allow", "alphabetUppercase.require"])
    expect(checkPassword(rule, "Abc")).toEqual([])
})

test("limits special characters to the usable ones", () => {
    const rule: Rule = {specialCharacter: {allow: true, require: true, usable: "!@#"}}
    expect(checkPassword(rule, "a!b")).toEqual([])
    expect(checkPassword(rule, "a?b")).toEqual(["specialCharacter.usable"])
})

test("rejects spaces and non-ASCII characters", () => {
    expect(checkPassword({}, "pass word")).toEqual(["unsupportedCharacter"])
    expect(checkPassword({}, "비밀번호1")).toEqual(["unsupportedCharacter"])
})

test("alphabet requires a letter of either case", () => {
    const rule: Rule = {alphabet: {require: true}}
    expect(checkPassword(rule, "1234A")).toEqual([])
    expect(checkPassword(rule, "1234a")).toEqual([])
    expect(checkPassword(rule, "1234!")).toEqual(["alphabet.require"])
})

test("combination counts the distinct classes used", () => {
    const twoOfThree: Rule = {combination: {min: 2, of: ["alphabetLowercase", "number", "specialCharacter"]}}
    expect(checkPassword(twoOfThree, "abcd1234")).toEqual([])
    expect(checkPassword(twoOfThree, "abcdEFGH")).toEqual(["combination"])
    expect(checkPassword({combination: {min: 3}}, "abCD12")).toEqual([])
    expect(checkPassword({combination: {min: 3}}, "abcd12")).toEqual(["combination"])
})

test("forbidden characters, repeats and sequences", () => {
    expect(checkPassword({forbidden: {characters: "<>"}}, "a<b")).toEqual(["forbidden.characters"])
    expect(checkPassword({forbidden: {maxRepeat: 2}}, "aab")).toEqual([])
    expect(checkPassword({forbidden: {maxRepeat: 2}}, "aaab")).toEqual(["forbidden.maxRepeat"])
    expect(checkPassword({forbidden: {maxSequence: 2}}, "ab13")).toEqual([])
    expect(checkPassword({forbidden: {maxSequence: 2}}, "xabc")).toEqual(["forbidden.maxSequence"])
    expect(checkPassword({forbidden: {maxSequence: 2}}, "x321")).toEqual(["forbidden.maxSequence"])
    expect(checkPassword({forbidden: {maxSequence: 2}}, "9:;")).toEqual([])
})

test("forbidden.id compares the account id case-insensitively", () => {
    const rule: Rule = {forbidden: {id: true}}
    expect(checkPassword(rule, "xHoSeung1", {id: "hoseung"})).toEqual(["forbidden.id"])
    expect(checkPassword(rule, "xHoSeung1")).toEqual([])
})

test("migrated rules accept letters of either case", () => {
    const kakao = getRule("accounts.kakao.com")!
    expect(checkPassword(kakao, "ABCD1234")).toEqual([])
    expect(checkPassword(kakao, "12345678")).toEqual(["alphabet.require"])
})
