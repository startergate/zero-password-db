export type CharacterSetRule = {
    allow: boolean
    require: boolean
    usable?: string
}

export type RuleStringLength = {
    min?: number
    max?: number
}

// Letters of either case. `allow` / `require` apply to letters as a whole ("영문 필수" is `require: true`),
// and `uppercase` / `lowercase` narrow them down by case.
export type AlphabetRule = {
    allow: boolean
    require: boolean
    uppercase?: CharacterSetRule
    lowercase?: CharacterSetRule
}

export type CharacterClass = 'uppercase' | 'lowercase' | 'number' | 'specialCharacter'

// A class counted by `combination`. `alphabet` counts letters of either case as one class.
export type CombinationClass = CharacterClass | 'alphabet'

// "영문·숫자·특수문자 중 2가지 이상": at least `min` of the classes in `of` must appear.
export type CombinationRule = {
    min: number
    // default: uppercase, lowercase, number, specialCharacter
    of?: CombinationClass[]
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

// Characters are ASCII only: letters A-Z and a-z, number 0-9 and specialCharacter for the other
// printable characters (! to ~). Anything else, such as a space or non-ASCII letters, is never allowed.
export type Rule = {
    alphabet?: AlphabetRule
    number?: CharacterSetRule
    specialCharacter?: CharacterSetRule
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

type CharacterSetPath = 'alphabet.uppercase' | 'alphabet.lowercase' | 'number' | 'specialCharacter'

export type RuleViolation =
    | 'alphabet.allow'
    | 'alphabet.require'
    | `${CharacterSetPath}.allow`
    | `${CharacterSetPath}.require`
    | `${CharacterSetPath}.usable`
    | 'combination'
    | 'forbidden.characters'
    | 'forbidden.maxRepeat'
    | 'forbidden.maxSequence'
    | 'forbidden.id'
    | 'length.min'
    | 'length.max'
    | 'unsupportedCharacter'
