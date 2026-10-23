import type {CharacterClass, CharacterSetRule, Rule, RuleViolation} from "./types.js";

export const CHARACTER_CLASSES: CharacterClass[] = ['uppercase', 'lowercase', 'number', 'specialCharacter']

export const characterClassOf = (character: string): CharacterClass | null => {
    if (/^[A-Z]$/.test(character)) return 'uppercase'
    if (/^[a-z]$/.test(character)) return 'lowercase'
    if (/^[0-9]$/.test(character)) return 'number'
    if (/^[!-~]$/.test(character)) return 'specialCharacter'
    return null
}

const longestRun = (characters: string[], continues: (previous: string, current: string) => boolean) => {
    let longest = characters.length ? 1 : 0
    let current = 1
    for (let i = 1; i < characters.length; i++) {
        current = continues(characters[i - 1]!, characters[i]!) ? current + 1 : 1
        longest = Math.max(longest, current)
    }
    return longest
}

// Only letters and digits form a sequence, so "abc" and "987" count but "./0" does not.
const isSequenceStep = (step: number) => (previous: string, current: string) => {
    const kind = characterClassOf(previous)
    return kind !== null && kind !== 'specialCharacter' && kind === characterClassOf(current)
        && current.charCodeAt(0) - previous.charCodeAt(0) === step
}

const characterSets = (rule: Rule) => ({
    uppercase: {path: 'alphabet.uppercase', rule: rule.alphabet?.uppercase},
    lowercase: {path: 'alphabet.lowercase', rule: rule.alphabet?.lowercase},
    number: {path: 'number', rule: rule.number},
    specialCharacter: {path: 'specialCharacter', rule: rule.specialCharacter},
} as const satisfies Record<CharacterClass, {path: string, rule?: CharacterSetRule}>)

// Checks a password against a rule, locally. Returns the parts of the rule the password breaks,
// or an empty array when it satisfies the rule. Pass `id` to check `forbidden.id`.
export const checkPassword = (rule: Rule, password: string, options: {id?: string} = {}): RuleViolation[] => {
    const violations = new Set<RuleViolation>()
    const characters = Array.from(password)
    const used = new Set<CharacterClass>()
    const sets = characterSets(rule)

    for (const character of characters) {
        const kind = characterClassOf(character)
        if (!kind) {
            violations.add('unsupportedCharacter')
            continue
        }
        used.add(kind)
        const {path, rule: setRule} = sets[kind]
        if (setRule && !setRule.allow) violations.add(`${path}.allow`)
        else if (setRule?.usable !== undefined && !setRule.usable.includes(character)) violations.add(`${path}.usable`)
        if (rule.forbidden?.characters?.includes(character)) violations.add('forbidden.characters')
    }

    const usedLetter = used.has('uppercase') || used.has('lowercase')
    if (rule.alphabet?.require && !usedLetter) violations.add('alphabet.require')
    for (const kind of CHARACTER_CLASSES) {
        const {path, rule: setRule} = sets[kind]
        if (setRule?.require && !used.has(kind)) violations.add(`${path}.require`)
    }
    if (rule.combination) {
        const of = rule.combination.of ?? CHARACTER_CLASSES
        const count = of.filter((kind) => kind === 'alphabet' ? usedLetter : used.has(kind)).length
        if (count < rule.combination.min) violations.add('combination')
    }

    const {maxRepeat, maxSequence, id} = rule.forbidden ?? {}
    if (maxRepeat !== undefined && longestRun(characters, (a, b) => a === b) > maxRepeat) {
        violations.add('forbidden.maxRepeat')
    }
    if (maxSequence !== undefined
        && Math.max(longestRun(characters, isSequenceStep(1)), longestRun(characters, isSequenceStep(-1))) > maxSequence) {
        violations.add('forbidden.maxSequence')
    }
    if (id && options.id && password.toLowerCase().includes(options.id.toLowerCase())) violations.add('forbidden.id')

    if (rule.length?.min !== undefined && characters.length < rule.length.min) violations.add('length.min')
    if (rule.length?.max !== undefined && characters.length > rule.length.max) violations.add('length.max')

    return [...violations]
}
