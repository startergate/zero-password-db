export type CharacterSetRule = {
    allow: boolean
    require: boolean
    usable?: string
}

export type RuleStringLength = {
    min?: number
    max?: number
}

export type Rule = {
    id?: {
        email?: boolean
        alphabetUppercase?: CharacterSetRule
        alphabetLowercase?: CharacterSetRule
        number?: CharacterSetRule
        specialCharacter?: CharacterSetRule
        length?: RuleStringLength
    }
    alphabetUppercase?: CharacterSetRule
    alphabetLowercase?: CharacterSetRule
    number?: CharacterSetRule
    specialCharacter?: CharacterSetRule
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
