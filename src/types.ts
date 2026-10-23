export type CharacterSetRule = {
    allow: boolean
    require: boolean
    usable?: string
}

export type RuleStringLength = {
    min?: number
    max?: number
}

export type CharacterClass = 'alphabetUppercase' | 'alphabetLowercase' | 'number' | 'specialCharacter'

// Letters of either case, for sites that ask for "영문" without caring about the case.
export type AlphabetRule = {
    require: boolean
}

// "영문·숫자·특수문자 중 2가지 이상": at least `min` of the classes in `of` must appear.
export type CombinationRule = {
    min: number
    // default: all four classes
    of?: CharacterClass[]
}

export type ForbiddenRule = {
    // characters that may never appear, even when their class is allowed
    characters?: string
    // the same character at most this many times in a row ("aaa" is 3)
    maxRepeat?: number
    // consecutive ascending or descending characters at most this long ("abc", "321" are 3)
    maxSequence?: number
    // the password must not contain the account id
    id?: boolean
}

// Character classes are ASCII only: uppercase A-Z, lowercase a-z, number 0-9 and
// specialCharacter for the other printable characters (! to ~). Anything else, such as a space
// or non-ASCII letters, is never allowed.
export type Rule = {
    alphabetUppercase?: CharacterSetRule
    alphabetLowercase?: CharacterSetRule
    number?: CharacterSetRule
    specialCharacter?: CharacterSetRule
    alphabet?: AlphabetRule
    combination?: CombinationRule
    forbidden?: ForbiddenRule
    length?: RuleStringLength
}

export type RuleReference = {
    $ref: string
}

// Rule found for a queried domain. `domain` is the database entry that matched the query.
export type RuleMatch = {
    domain: string
    rule: Rule
}

export type RuleViolation =
    | `${CharacterClass}.allow`
    | `${CharacterClass}.require`
    | `${CharacterClass}.usable`
    | 'alphabet.require'
    | 'combination'
    | 'forbidden.characters'
    | 'forbidden.maxRepeat'
    | 'forbidden.maxSequence'
    | 'forbidden.id'
    | 'length.min'
    | 'length.max'
    | 'unsupportedCharacter'
