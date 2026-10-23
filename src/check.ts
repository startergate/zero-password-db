import type {CharacterClass, Rule, RuleViolation} from "./types.js";

export const CHARACTER_CLASSES: CharacterClass[] = ['alphabetUppercase', 'alphabetLowercase', 'number', 'specialCharacter']

export const characterClassOf = (character: string): CharacterClass | null => {
    if (/^[A-Z]$/.test(character)) return 'alphabetUppercase'
    if (/^[a-z]$/.test(character)) return 'alphabetLowercase'
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

// Checks a password against a rule, locally. Returns the parts of the rule the password breaks,
// or an empty array when it satisfies the rule. Pass `id` to check `forbidden.id`.
export const checkPassword = (rule: Rule, password: string, options: {id?: string} = {}): RuleViolation[] => {
    const violations = new Set<RuleViolation>()
    const characters = Array.from(password)
    const used = new Set<CharacterClass>()

    for (const character of characters) {
        const kind = characterClassOf(character)
        if (!kind) {
            violations.add('unsupportedCharacter')
            continue
        }
        used.add(kind)
        const classRule = rule[kind]
        if (classRule && !classRule.allow) violations.add(`${kind}.allow`)
        else if (classRule?.usable !== undefined && !classRule.usable.includes(character)) violations.add(`${kind}.usable`)
        if (rule.forbidden?.characters?.includes(character)) violations.add('forbidden.characters')
    }

    for (const kind of CHARACTER_CLASSES) {
        if (rule[kind]?.require && !used.has(kind)) violations.add(`${kind}.require`)
    }
    if (rule.alphabet?.require && !used.has('alphabetUppercase') && !used.has('alphabetLowercase')) {
        violations.add('alphabet.require')
    }
    if (rule.combination) {
        const of = rule.combination.of ?? CHARACTER_CLASSES
        if (of.filter((kind) => used.has(kind)).length < rule.combination.min) violations.add('combination')
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
