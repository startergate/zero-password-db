import {characterClassOf} from "./check.js";
import type {CharacterClass, CombinationClass} from "./types.js";

// Checks a parsed `rule.json` against the `Rule` type, which only exists at compile time.
// Used by the rule tests and by the rule request workflow (scripts/rule-request.ts).

export const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0

const COMBINATION_CLASSES: CombinationClass[] = ['uppercase', 'lowercase', 'number', 'specialCharacter', 'alphabet']

// Returns the problems found in a rule, each as "<path>: <message>".
export const validateRule = (rule: unknown): string[] => {
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
