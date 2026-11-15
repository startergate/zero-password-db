import type {CharacterClass, CharacterSetRule, CombinationClass, Rule, RuleViolation} from "./types.js";

// One line of a rule, as a client shows it.
export type RuleLine = {
    text: string
    // The `checkPassword` codes this line stands for. The line is unmet when any of them is reported.
    violations: RuleViolation[]
    // Set when the line names a list of characters too long to fit in `text`
    // ("Only some special characters allowed"). Clients show it on demand, such as in a popover.
    characters?: string
    // Set on the line for `unsupportedCharacter`, which every rule has. Clients show it only while unmet,
    // so it explains why the input is rejected without adding a line to every site.
    onlyWhenUnmet?: true
}

export type DescribeOptions = {
    // Any BCP 47 tag ("ko", "ko-KR", "en-US"). Only the language part is used.
    // Languages without built-in text fall back to English.
    locale?: string
}

export type DescribeLocale = 'en' | 'ko'

// Character lists up to this length are written into the line itself.
export const MAX_INLINE_CHARACTERS = 10

type Kind = CombinationClass

type Texts = {
    kind: Record<Kind, string>
    lengthRange: (min: number, max: number) => string
    lengthExact: (length: number) => string
    lengthMin: (min: number) => string
    lengthMax: (max: number) => string
    include: (kind: Kind) => string
    notAllowed: (kind: Kind) => string
    usable: (kind: CharacterClass, characters: string) => string
    usableLimited: (kind: CharacterClass) => string
    combination: (min: number, of: Kind[]) => string
    forbiddenCharacters: (characters: string) => string
    forbiddenCharactersMany: string
    maxRepeat: (count: number) => string
    maxSequence: (length: number, examples: string) => string
    id: string
    unsupported: string
}

const spaced = (characters: string) => Array.from(characters).join(' ')

const TEXTS: Record<DescribeLocale, Texts> = {
    en: {
        kind: {
            alphabet: 'letters',
            uppercase: 'uppercase letters',
            lowercase: 'lowercase letters',
            number: 'numbers',
            specialCharacter: 'special characters',
        },
        lengthRange: (min, max) => `${min}–${max} characters`,
        lengthExact: (length) => `Exactly ${length} characters`,
        lengthMin: (min) => `At least ${min} characters`,
        lengthMax: (max) => `Up to ${max} characters`,
        include: (kind) => ({
            alphabet: 'Include a letter',
            uppercase: 'Include an uppercase letter',
            lowercase: 'Include a lowercase letter',
            number: 'Include a number',
            specialCharacter: 'Include a special character',
        })[kind],
        notAllowed: (kind) => `No ${TEXTS.en.kind[kind]}`,
        usable: (kind, characters) => `${capitalize(TEXTS.en.kind[kind])}: only ${spaced(characters)}`,
        usableLimited: (kind) => `Only some ${TEXTS.en.kind[kind]} allowed`,
        combination: (min, of) => `At least ${min} of: ${of.map((kind) => TEXTS.en.kind[kind]).join(', ')}`,
        forbiddenCharacters: (characters) => `Not allowed: ${spaced(characters)}`,
        forbiddenCharactersMany: 'Some characters not allowed',
        maxRepeat: (count) => `No character ${count} times in a row`,
        maxSequence: (length, examples) => `No sequences of ${length} or more${examples ? ` (${examples})` : ''}`,
        id: 'Must not contain your ID',
        unsupported: 'No spaces, emoji or non-English letters',
    },
    ko: {
        kind: {
            alphabet: '영문',
            uppercase: '영문 대문자',
            lowercase: '영문 소문자',
            number: '숫자',
            specialCharacter: '특수문자',
        },
        lengthRange: (min, max) => `${min}~${max}자`,
        lengthExact: (length) => `${length}자`,
        lengthMin: (min) => `${min}자 이상`,
        lengthMax: (max) => `${max}자 이하`,
        include: (kind) => `${TEXTS.ko.kind[kind]} 포함`,
        notAllowed: (kind) => `${TEXTS.ko.kind[kind]} 사용 불가`,
        usable: (kind, characters) => `${TEXTS.ko.kind[kind]}는 ${spaced(characters)} 만`,
        usableLimited: (kind) => `사용 가능한 ${TEXTS.ko.kind[kind]} 제한됨`,
        combination: (min, of) => `${of.map((kind) => TEXTS.ko.kind[kind]).join('·')} 중 ${min}가지 이상`,
        forbiddenCharacters: (characters) => `쓸 수 없는 문자: ${spaced(characters)}`,
        forbiddenCharactersMany: '쓸 수 없는 문자 있음',
        maxRepeat: (count) => `같은 문자 ${count}번 연속 불가`,
        maxSequence: (length, examples) => `연속된 문자${examples ? `(${examples})` : ''} ${length}자 이상 불가`,
        id: '아이디 포함 불가',
        unsupported: '공백·한글·이모지 등 사용 불가',
    },
}

function capitalize(text: string) {
    return text.charAt(0).toUpperCase() + text.slice(1)
}

export const resolveLocale = (locale?: string): DescribeLocale => {
    const language = locale?.split(/[-_]/)[0]?.toLowerCase()
    return language === 'ko' ? 'ko' : 'en'
}

const DEFAULT_COMBINATION: CombinationClass[] = ['uppercase', 'lowercase', 'number', 'specialCharacter']

// "abcd, 4321" for a sequence of 4. Each example only when the alphabet or digits are long enough.
const sequenceExamples = (length: number) => {
    const examples: string[] = []
    if (length <= 26) examples.push('abcdefghijklmnopqrstuvwxyz'.slice(0, length))
    if (length <= 9) examples.push('987654321'.slice(9 - length))
    return examples.join(', ')
}

// Turns a rule into the lines a client shows, in display order (chrome spec §4.3).
// A class that is allowed but not required gives no line. The last line is always the one for
// `unsupportedCharacter` (characters outside printable ASCII), marked `onlyWhenUnmet`; a rule without
// any other limit gives only that line.
export const describeRule = (rule: Rule, options: DescribeOptions = {}): RuleLine[] => {
    const t = TEXTS[resolveLocale(options.locale)]
    const lines: RuleLine[] = []
    const characterList = (
        characters: string,
        violation: RuleViolation,
        short: (characters: string) => string,
        long: string,
    ): RuleLine => Array.from(characters).length <= MAX_INLINE_CHARACTERS
        ? {text: short(characters), violations: [violation]}
        : {text: long, violations: [violation], characters}

    const {min, max} = rule.length ?? {}
    if (min !== undefined && max !== undefined) {
        lines.push({text: min === max ? t.lengthExact(min) : t.lengthRange(min, max), violations: ['length.min', 'length.max']})
    } else if (min !== undefined) {
        lines.push({text: t.lengthMin(min), violations: ['length.min']})
    } else if (max !== undefined) {
        lines.push({text: t.lengthMax(max), violations: ['length.max']})
    }

    if (rule.alphabet?.require) lines.push({text: t.include('alphabet'), violations: ['alphabet.require']})

    const usable = (kind: CharacterClass, path: string, set?: CharacterSetRule) => {
        if (set?.allow === false || set?.usable === undefined) return
        lines.push(characterList(set.usable, `${path}.usable` as RuleViolation,
            (characters) => t.usable(kind, characters), t.usableLimited(kind)))
    }
    const characterSet = (kind: CharacterClass, path: string, set?: CharacterSetRule) => {
        if (!set) return
        if (!set.allow) lines.push({text: t.notAllowed(kind), violations: [`${path}.allow` as RuleViolation]})
        else if (set.require) lines.push({text: t.include(kind), violations: [`${path}.require` as RuleViolation]})
    }

    const {uppercase, lowercase} = rule.alphabet ?? {}
    if (uppercase?.allow === false && lowercase?.allow === false) {
        lines.push({text: t.notAllowed('alphabet'), violations: ['alphabet.uppercase.allow', 'alphabet.lowercase.allow']})
    } else {
        characterSet('uppercase', 'alphabet.uppercase', uppercase)
        characterSet('lowercase', 'alphabet.lowercase', lowercase)
    }
    usable('uppercase', 'alphabet.uppercase', uppercase)
    usable('lowercase', 'alphabet.lowercase', lowercase)
    characterSet('number', 'number', rule.number)
    usable('number', 'number', rule.number)
    characterSet('specialCharacter', 'specialCharacter', rule.specialCharacter)
    usable('specialCharacter', 'specialCharacter', rule.specialCharacter)

    if (rule.combination) {
        lines.push({
            text: t.combination(rule.combination.min, rule.combination.of ?? DEFAULT_COMBINATION),
            violations: ['combination'],
        })
    }

    const {characters, maxRepeat, maxSequence, id} = rule.forbidden ?? {}
    if (characters) {
        lines.push(characterList(characters, 'forbidden.characters', t.forbiddenCharacters, t.forbiddenCharactersMany))
    }
    if (maxRepeat !== undefined) lines.push({text: t.maxRepeat(maxRepeat + 1), violations: ['forbidden.maxRepeat']})
    if (maxSequence !== undefined) {
        lines.push({text: t.maxSequence(maxSequence + 1, sequenceExamples(maxSequence + 1)), violations: ['forbidden.maxSequence']})
    }
    if (id) lines.push({text: t.id, violations: ['forbidden.id']})

    lines.push({text: t.unsupported, violations: ['unsupportedCharacter'], onlyWhenUnmet: true})
    return lines
}
