import {describe, expect, test} from "bun:test";
import * as fs from "node:fs";
import path from "path";
import {checkPassword, describeRule as fullDescribeRule, findRule} from "./index";
import {describeRule as liteDescribeRule} from "./lite";
import {describeRule, MAX_INLINE_CHARACTERS, resolveLocale} from "./describe";
import type {Rule, RuleViolation} from "./types";

// Lines without the always-present `unsupportedCharacter` line, which has its own test.
const lines = (rule: Rule, locale?: string) => describeRule(rule, {locale}).filter((line) => !line.onlyWhenUnmet)
const texts = (rule: Rule, locale?: string) => lines(rule, locale).map((line) => line.text)

describe('resolveLocale', () => {
    test('uses the language part of a tag', () => {
        expect(resolveLocale('ko')).toBe('ko')
        expect(resolveLocale('ko-KR')).toBe('ko')
        expect(resolveLocale('KO_kr')).toBe('ko')
        expect(resolveLocale('en-US')).toBe('en')
    })
    test('falls back to English', () => {
        expect(resolveLocale()).toBe('en')
        expect(resolveLocale('ja')).toBe('en')
        expect(resolveLocale('')).toBe('en')
    })
})

describe('describeRule', () => {
    test('is exported from the full and lite entries', () => {
        expect(fullDescribeRule).toBe(describeRule)
        expect(liteDescribeRule).toBe(describeRule)
    })

    test('length', () => {
        expect(lines({length: {min: 8, max: 16}}, 'ko'))
            .toEqual([{text: '8~16자', violations: ['length.min', 'length.max']}])
        expect(texts({length: {min: 8}}, 'ko')).toEqual(['8자 이상'])
        expect(texts({length: {max: 16}}, 'ko')).toEqual(['16자 이하'])
        expect(texts({length: {min: 6, max: 6}}, 'ko')).toEqual(['6자'])
        expect(texts({length: {min: 8, max: 16}})).toEqual(['8–16 characters'])
        expect(texts({length: {min: 8}})).toEqual(['At least 8 characters'])
        expect(texts({length: {max: 16}})).toEqual(['Up to 16 characters'])
    })

    test('allowed but not required classes give no line', () => {
        const rule: Rule = {
            alphabet: {require: false, uppercase: {allow: true, require: false}, lowercase: {allow: true, require: false}},
            number: {allow: true, require: false},
            specialCharacter: {allow: true, require: false},
        }
        expect(lines(rule)).toEqual([])
        expect(lines({})).toEqual([])
    })

    test('character classes in display order', () => {
        const rule: Rule = {
            specialCharacter: {allow: false, require: false},
            number: {allow: true, require: true},
            alphabet: {require: true, uppercase: {allow: true, require: true}, lowercase: {allow: false, require: false}},
            length: {min: 8, max: 32},
        }
        expect(lines(rule, 'ko')).toEqual([
            {text: '8~32자', violations: ['length.min', 'length.max']},
            {text: '영문 포함', violations: ['alphabet.require']},
            {text: '영문 대문자 포함', violations: ['alphabet.uppercase.require']},
            {text: '영문 소문자 사용 불가', violations: ['alphabet.lowercase.allow']},
            {text: '숫자 포함', violations: ['number.require']},
            {text: '특수문자 사용 불가', violations: ['specialCharacter.allow']},
        ])
        expect(texts(rule, 'en')).toEqual([
            '8–32 characters', 'Include a letter', 'Include an uppercase letter', 'No lowercase letters',
            'Include a number', 'No special characters',
        ])
    })

    test('no letters at all is one line', () => {
        const rule: Rule = {alphabet: {require: false, uppercase: {allow: false, require: false}, lowercase: {allow: false, require: false}}}
        expect(lines(rule, 'ko'))
            .toEqual([{text: '영문 사용 불가', violations: ['alphabet.uppercase.allow', 'alphabet.lowercase.allow']}])
        expect(texts(rule)).toEqual(['No letters'])
    })

    test('short usable lists are written into the line', () => {
        const rule: Rule = {specialCharacter: {allow: true, require: true, usable: '!@#$'}}
        expect(lines(rule, 'ko')).toEqual([
            {text: '특수문자 포함', violations: ['specialCharacter.require']},
            {text: '특수문자는 ! @ # $ 만', violations: ['specialCharacter.usable']},
        ])
        expect(texts(rule)).toEqual(['Include a special character', 'Special characters: only ! @ # $'])
    })

    test('long usable lists move to `characters`', () => {
        const usable = '!$%&()*+,-./:;<>=?@#[\\]^_{|}~'
        const rule: Rule = {specialCharacter: {allow: true, require: false, usable}}
        expect(lines(rule, 'ko'))
            .toEqual([{text: '사용 가능한 특수문자 제한됨', violations: ['specialCharacter.usable'], characters: usable}])
        expect(lines(rule)[0]?.text).toBe('Only some special characters allowed')
        const atLimit = '!@#$%^&*()'
        expect(atLimit.length).toBe(MAX_INLINE_CHARACTERS)
        expect(lines({specialCharacter: {allow: true, require: false, usable: atLimit}})[0]?.characters).toBeUndefined()
    })

    test('usable is skipped for a class that is not allowed', () => {
        expect(lines({number: {allow: false, require: false, usable: '12'}}, 'ko'))
            .toEqual([{text: '숫자 사용 불가', violations: ['number.allow']}])
    })

    test('combination', () => {
        expect(texts({combination: {min: 2, of: ['alphabet', 'number', 'specialCharacter']}}, 'ko'))
            .toEqual(['영문·숫자·특수문자 중 2가지 이상'])
        expect(texts({combination: {min: 3}}, 'ko')).toEqual(['영문 대문자·영문 소문자·숫자·특수문자 중 3가지 이상'])
        expect(texts({combination: {min: 2, of: ['alphabet', 'number', 'specialCharacter']}}))
            .toEqual(['At least 2 of: letters, numbers, special characters'])
    })

    test('forbidden', () => {
        const rule: Rule = {forbidden: {characters: "<>'", maxRepeat: 2, maxSequence: 3, id: true}}
        expect(lines(rule, 'ko')).toEqual([
            {text: "쓸 수 없는 문자: < > '", violations: ['forbidden.characters']},
            {text: '같은 문자 3번 연속 불가', violations: ['forbidden.maxRepeat']},
            {text: '연속된 문자(abcd, 4321) 4자 이상 불가', violations: ['forbidden.maxSequence']},
            {text: '아이디 포함 불가', violations: ['forbidden.id']},
        ])
        expect(texts(rule)).toEqual([
            "Not allowed: < > '", 'No character 3 times in a row', 'No sequences of 4 or more (abcd, 4321)',
            'Must not contain your ID',
        ])
        expect(lines({forbidden: {characters: '<>\'"`;:&|\\/'}}, 'ko'))
            .toEqual([{text: '쓸 수 없는 문자 있음', violations: ['forbidden.characters'], characters: '<>\'"`;:&|\\/'}])
        expect(texts({forbidden: {maxSequence: 12}}, 'ko')).toEqual(['연속된 문자(abcdefghijklm) 13자 이상 불가'])
    })

    test('the unsupported character line is always last', () => {
        expect(describeRule({}, {locale: 'ko'}))
            .toEqual([{text: '공백·한글·이모지 등 사용 불가', violations: ['unsupportedCharacter'], onlyWhenUnmet: true}])
        const all = describeRule({length: {min: 8}, forbidden: {id: true}})
        expect(all.at(-1)).toEqual({text: 'No spaces, emoji or non-English letters', violations: ['unsupportedCharacter'], onlyWhenUnmet: true})
        expect(all.filter((line) => line.onlyWhenUnmet)).toHaveLength(1)
        expect(checkPassword({}, '비밀 번호')).toEqual(['unsupportedCharacter'])
    })

    test('unknown locales fall back to English', () => {
        expect(texts({length: {min: 8}}, 'ja-JP')).toEqual(['At least 8 characters'])
    })

    // Every code `checkPassword` reports for a database rule must belong to one of its lines.
    test('every violation of a database rule maps to a line', () => {
        const databasesPath = path.join(import.meta.dir, '..', 'databases')
        const passwords = ['', 'a', 'A', '1', '!', 'aaaa', 'abcdefgh', '12345678', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '<>\'"`;:&|\\/ ']
        for (const domain of fs.readdirSync(databasesPath)) {
            const match = findRule(domain)
            if (!match) continue
            const covered = new Set<RuleViolation>(describeRule(match.rule).flatMap((line) => line.violations))
            for (const password of passwords) {
                for (const violation of checkPassword(match.rule, password, {id: 'aaaa'})) {
                    expect({domain, violation, covered: covered.has(violation)}).toEqual({domain, violation, covered: true})
                }
            }
        }
    })
})
