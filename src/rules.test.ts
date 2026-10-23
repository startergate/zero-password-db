import {describe, expect, test} from "bun:test";
import * as fs from "node:fs";
import path from "path";
import {checkPassword} from "./index";
import {characterClassOf} from "./check";
import {normalizeDomain} from "./domain";
import type {CharacterClass, CharacterSetRule, CombinationClass, Rule} from "./types";

// Checks every `databases/<domain>/rule.json` against the `Rule` type, which only exists at compile time.

const databasesPath = path.join(import.meta.dir, '..', 'databases')
const domains = fs.readdirSync(databasesPath).sort()

const load = (domain: string): unknown => JSON.parse(fs.readFileSync(path.join(databasesPath, domain, 'rule.json')).toString())

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0

const COMBINATION_CLASSES: CombinationClass[] = ['uppercase', 'lowercase', 'number', 'specialCharacter', 'alphabet']

// Returns the problems found in a rule, each as "<path>: <message>".
const validateRule = (rule: unknown): string[] => {
    const problems: string[] = []
    const keys = (value: Record<string, unknown>, at: string, allowed: string[]) => {
        for (const key of Object.keys(value)) {
            if (!allowed.includes(key)) problems.push(`${at}${key}: unknown key`)
        }
    }

    const characterSet = (value: unknown, at: string, kind: CharacterClass) => {
        if (value === undefined) return
        if (!isObject(value)) return problems.push(`${at}: not an object`)
        keys(value, `${at}.`, ['allow', 'require', 'usable'])
        if (typeof value.allow !== 'boolean') problems.push(`${at}.allow: not a boolean`)
        if (typeof value.require !== 'boolean') problems.push(`${at}.require: not a boolean`)
        if (value.allow === false && value.require === true) problems.push(`${at}: required but not allowed`)
        if (value.usable === undefined) return
        if (typeof value.usable !== 'string' || value.usable === '') return problems.push(`${at}.usable: not a non-empty string`)
        const outside = Array.from(value.usable).filter((character) => characterClassOf(character) !== kind)
        if (outside.length) problems.push(`${at}.usable: ${JSON.stringify(outside.join(''))} is not ${kind}`)
        if (new Set(value.usable).size !== value.usable.length) problems.push(`${at}.usable: duplicate characters`)
    }

    if (!isObject(rule)) return ['rule: not an object']
    keys(rule, '', ['alphabet', 'number', 'specialCharacter', 'combination', 'forbidden', 'length'])

    const {alphabet, combination, forbidden, length} = rule
    if (alphabet !== undefined) {
        if (!isObject(alphabet)) {
            problems.push('alphabet: not an object')
        } else {
            keys(alphabet, 'alphabet.', ['require', 'uppercase', 'lowercase'])
            if (typeof alphabet.require !== 'boolean') problems.push('alphabet.require: not a boolean')
            characterSet(alphabet.uppercase, 'alphabet.uppercase', 'uppercase')
            characterSet(alphabet.lowercase, 'alphabet.lowercase', 'lowercase')
        }
    }
    characterSet(rule.number, 'number', 'number')
    characterSet(rule.specialCharacter, 'specialCharacter', 'specialCharacter')

    if (combination !== undefined) {
        if (!isObject(combination)) {
            problems.push('combination: not an object')
        } else {
            keys(combination, 'combination.', ['min', 'of'])
            const of = combination.of ?? ['uppercase', 'lowercase', 'number', 'specialCharacter']
            if (!Array.isArray(of) || of.some((kind) => !COMBINATION_CLASSES.includes(kind))) {
                problems.push('combination.of: not a list of character classes')
            } else if (new Set(of).size !== of.length) {
                problems.push('combination.of: duplicate classes')
            } else if (!isCount(combination.min) || (combination.min as number) < 1 || (combination.min as number) > of.length) {
                problems.push(`combination.min: not between 1 and ${of.length}`)
            }
        }
    }

    if (forbidden !== undefined) {
        if (!isObject(forbidden)) {
            problems.push('forbidden: not an object')
        } else {
            keys(forbidden, 'forbidden.', ['characters', 'maxRepeat', 'maxSequence', 'id'])
            if (forbidden.characters !== undefined
                && (typeof forbidden.characters !== 'string' || Array.from(forbidden.characters).some((c) => !characterClassOf(c)))) {
                problems.push('forbidden.characters: not a string of printable ASCII characters')
            }
            for (const key of ['maxRepeat', 'maxSequence'] as const) {
                if (forbidden[key] !== undefined && (!isCount(forbidden[key]) || (forbidden[key] as number) < 1)) {
                    problems.push(`forbidden.${key}: not a positive integer`)
                }
            }
            if (forbidden.id !== undefined && typeof forbidden.id !== 'boolean') problems.push('forbidden.id: not a boolean')
        }
    }

    if (length !== undefined) {
        if (!isObject(length)) {
            problems.push('length: not an object')
        } else {
            keys(length, 'length.', ['min', 'max'])
            if (length.min !== undefined && !isCount(length.min)) problems.push('length.min: not a non-negative integer')
            if (length.max !== undefined && (!isCount(length.max) || (length.max as number) < 1)) problems.push('length.max: not a positive integer')
            if (isCount(length.min) && isCount(length.max) && (length.min as number) > (length.max as number)) {
                problems.push('length: min is greater than max')
            }
        }
    }

    return problems
}

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
