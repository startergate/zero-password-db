import {describe, expect, test} from "bun:test";
import * as fs from "node:fs";
import path from "path";
import {checkPassword} from "./index";
import {characterClassOf} from "./check";
import {isObject, validateRule} from "./validate";
import {normalizeDomain} from "./domain";
import type {CharacterClass, CharacterSetRule, Rule} from "./types";

// Checks every `databases/<domain>/rule.json` against the `Rule` type.

const databasesPath = path.join(import.meta.dir, '..', 'databases')
const domains = fs.readdirSync(databasesPath).sort()

const load = (domain: string): unknown => JSON.parse(fs.readFileSync(path.join(databasesPath, domain, 'rule.json')).toString())

const PRINTABLE = Array.from({length: 0x7e - 0x21 + 1}, (_, i) => String.fromCharCode(0x21 + i))

// Builds a password from every allowed class in turn, so it uses as many classes as the rule permits.
// Consecutive characters always come from different classes, so they never repeat or form a sequence.
const samplePassword = (rule: Rule) => {
    const sets: Record<CharacterClass, CharacterSetRule | undefined> = {
        uppercase: rule.alphabet?.uppercase,
        lowercase: rule.alphabet?.lowercase,
        number: rule.number,
        specialCharacter: rule.specialCharacter,
    }
    const pools = (Object.keys(sets) as CharacterClass[])
        .filter((kind) => sets[kind]?.allow !== false)
        .map((kind) => PRINTABLE.filter((character) => characterClassOf(character) === kind
            && (sets[kind]?.usable ?? character).includes(character)
            && !rule.forbidden?.characters?.includes(character)))
        .filter((pool) => pool.length)
    const length = Math.max(rule.length?.min ?? 8, pools.length)
    return Array.from({length}, (_, i) => {
        const pool = pools[i % pools.length]!
        return pool[(Math.floor(i / pools.length) * 7) % pool.length]!
    }).join('')
}

describe.each(domains)("%s", (domain) => {
    const data = load(domain)

    test("folder name is a normalized domain", () => {
        expect(normalizeDomain(domain)).toBe(domain)
    })

    if (isObject(data) && '$ref' in data) {
        test("$ref points to an existing rule, not to another $ref", () => {
            expect(Object.keys(data)).toEqual(['$ref'])
            expect(typeof data.$ref).toBe('string')
            const target = data.$ref as string
            expect(target).not.toBe(domain)
            expect(domains).toContain(target)
            const resolved = load(target)
            expect(isObject(resolved) && '$ref' in resolved).toBe(false)
        })
        return
    }

    test("matches the Rule schema", () => {
        expect(validateRule(data)).toEqual([])
    })

    test("some password satisfies the rule", () => {
        const rule = data as Rule
        expect(checkPassword(rule, samplePassword(rule))).toEqual([])
    })
})

test("the validator reports broken rules", () => {
    expect(validateRule({length: {min: 8, max: 16}})).toEqual([])
    expect(validateRule({lenght: {min: 8}})).toEqual(['lenght: unknown key'])
    expect(validateRule({alphabet: {require: true, uppercase: {allow: false, require: true}}}))
        .toEqual(['alphabet.uppercase: required but not allowed'])
    expect(validateRule({alphabet: {uppercase: {allow: true, require: false}}}))
        .toEqual(['alphabet.require: not a boolean'])
    expect(validateRule({alphabetUppercase: {allow: true, require: false}})).toEqual(['alphabetUppercase: unknown key'])
    expect(validateRule({specialCharacter: {allow: true, require: true, usable: "!a"}}))
        .toEqual(['specialCharacter.usable: "a" is not specialCharacter'])
    expect(validateRule({combination: {min: 3, of: ['alphabet', 'number']}})).toEqual(['combination.min: not between 1 and 2'])
    expect(validateRule({combination: {min: 1, of: ['letters']}})).toEqual(['combination.of: not a list of character classes'])
    expect(validateRule({forbidden: {maxRepeat: 0}})).toEqual(['forbidden.maxRepeat: not a positive integer'])
    expect(validateRule({length: {min: 16, max: 8}})).toEqual(['length: min is greater than max'])
})

test("sample passwords respect usable and forbidden characters", () => {
    const rule: Rule = {
        alphabet: {require: true, uppercase: {allow: false, require: false}},
        specialCharacter: {allow: true, require: true, usable: "!@"},
        forbidden: {characters: "a", maxRepeat: 1, maxSequence: 1},
        length: {min: 12},
    }
    expect(checkPassword(rule, samplePassword(rule))).toEqual([])
})
