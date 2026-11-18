import * as fs from "node:fs";
import path from "path";
import {normalizeDomain} from "../src/domain";
import type {CharacterSetRule, CombinationClass, Rule, RuleReference} from "../src/types";
import {isObject, validateRule} from "../src/validate";

// Turns an issue opened with the "Password rule request" form (.github/ISSUE_TEMPLATE/rule-request.yml)
// into `databases/<domain>/rule.json`. Run by .github/workflows/rule-request.yml.
//
// Reads ISSUE_BODY and ISSUE_NUMBER. On success it writes the rule file, sets the `domain` and `action`
// step outputs and writes the pull request body to PR_BODY_FILE. On failure it writes the problems to
// ERRORS_FILE, as a comment for the issue, and exits with 1.

const databasesPath = path.join(import.meta.dir, '..', 'databases')

const NO_RESPONSE = '_No response_'

// Issue forms render each field as "### <label>" followed by its value.
export const parseIssueBody = (body: string): Record<string, string> => {
    const sections: Record<string, string> = {}
    let label: string | null = null
    let lines: string[] = []
    const flush = () => {
        if (label === null) return
        const value = lines.join('\n').trim()
        sections[label] = value === NO_RESPONSE ? '' : value
    }
    for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
        const heading = /^### (.+)$/.exec(line)
        if (heading) {
            flush()
            label = heading[1]!.trim()
            lines = []
        } else {
            lines.push(line)
        }
    }
    flush()
    return sections
}

// The rule field renders as a ```json code block; people sometimes paste their own fences inside it.
const stripCodeFences = (text: string) => {
    let value = text.trim()
    while (/^```[a-z]*\n(?:[\s\S]*\n)?```$/.test(value)) value = value.replace(/^```[a-z]*\n/, '').replace(/\n?```$/, '').trim()
    return value
}

// Labels of the rule fields in the form. Sections are keyed by label, so these must match the template.
export const FIELD = {
    lengthMin: 'Minimum length',
    lengthMax: 'Maximum length',
    uppercase: 'Uppercase letters (A-Z)',
    lowercase: 'Lowercase letters (a-z)',
    number: 'Numbers (0-9)',
    specialCharacter: 'Special characters',
    uppercaseUsable: 'Usable uppercase letters',
    lowercaseUsable: 'Usable lowercase letters',
    numberUsable: 'Usable numbers',
    specialCharacterUsable: 'Usable special characters',
    alphabetRequired: 'Letters',
    combinationMin: 'Combination minimum',
    combinationOf: 'Combination kinds',
    maxRepeat: 'Longest repeat',
    maxSequence: 'Longest sequence',
    forbiddenCharacters: 'Forbidden characters',
    noId: 'Account id',
    ref: 'Same rule as',
    rule: 'Rule JSON',
} as const

export const CHARACTER_SET_OPTION = {
    'No limit': undefined,
    'Not allowed': {allow: false, require: false},
    'Allowed': {allow: true, require: false},
    'Required': {allow: true, require: true},
} as const

export const CHECKBOX = {
    alphabetRequired: 'At least one letter of either case is required',
    noId: 'The password must not contain the account id',
    combinationOf: {
        'Letters (either case counts as one kind)': 'alphabet',
        'Uppercase letters': 'uppercase',
        'Lowercase letters': 'lowercase',
        'Numbers': 'number',
        'Special characters': 'specialCharacter',
    } as Record<string, CombinationClass>,
}

// Checkboxes render as "- [X] <label>" for checked and "- [ ] <label>" for unchecked options.
export const parseCheckboxes = (value: string): {checked: string[], unchecked: string[], unknown: string[]} => {
    const checked: string[] = []
    const unchecked: string[] = []
    const unknown: string[] = []
    for (const line of value.split('\n').map((line) => line.trim()).filter(Boolean)) {
        const option = /^- \[([ xX])\] (.+)$/.exec(line)
        if (!option) unknown.push(line)
        else (option[1] === ' ' ? unchecked : checked).push(option[2]!.trim())
    }
    return {checked, unchecked, unknown}
}

// Turns the rule fields of the form into a rule. `rule` is null when no rule field is filled.
// Keys follow the order of the `Rule` type, so the same answers always give the same file.
export const ruleFromFields = (sections: Record<string, string>): {rule: Rule | RuleReference | null, problems: string[]} => {
    const problems: string[] = []
    const text = (label: string) => (sections[label] ?? '').trim()
    let filled = false

    const integer = (label: string): number | undefined => {
        const value = text(label)
        if (!value) return undefined
        filled = true
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
            problems.push(`**${label}**: \`${value}\` is not a whole number.`)
            return undefined
        }
        return Number(value)
    }
    const string = (label: string): string | undefined => {
        const value = text(label)
        if (!value) return undefined
        filled = true
        return value
    }
    const checkboxes = (label: string, known: string[]): string[] => {
        const {checked, unchecked, unknown} = parseCheckboxes(text(label))
        for (const line of unknown) problems.push(`**${label}**: \`${line}\` is not an option of this field.`)
        // unchecked options change nothing, but an unknown one means the issue body was edited by hand
        for (const option of unchecked) {
            if (!known.includes(option)) problems.push(`**${label}**: \`${option}\` is not an option of this field.`)
        }
        const result: string[] = []
        for (const option of checked) {
            if (!known.includes(option)) {
                problems.push(`**${label}**: \`${option}\` is not an option of this field.`)
            } else if (result.includes(option)) {
                // only an edited issue body can repeat an option; report it once however many times it repeats
                const problem = `**${label}**: \`${option}\` is checked more than once.`
                if (!problems.includes(problem)) problems.push(problem)
            } else {
                result.push(option)
            }
        }
        if (result.length) filled = true
        return result
    }
    const characterSet = (label: string, usableLabel: string): CharacterSetRule | undefined => {
        const choice = text(label) || 'No limit'
        const usable = string(usableLabel)
        if (!(choice in CHARACTER_SET_OPTION)) {
            filled = true
            problems.push(`**${label}**: \`${choice}\` is not an option of this field.`)
            return undefined
        }
        const base = CHARACTER_SET_OPTION[choice as keyof typeof CHARACTER_SET_OPTION]
        if (base) filled = true
        if (usable !== undefined && !base?.allow) {
            problems.push(`**${usableLabel}**: set **${label}** to "Allowed" or "Required" to list its usable characters.`)
            return undefined
        }
        if (!base) return undefined
        return usable === undefined ? {...base} : {...base, usable}
    }

    // read apart from the other fields, so `filled` only tells whether any of those has a value
    const ref = text(FIELD.ref)

    const alphabetRequired = checkboxes(FIELD.alphabetRequired, [CHECKBOX.alphabetRequired]).length > 0
    const uppercase = characterSet(FIELD.uppercase, FIELD.uppercaseUsable)
    const lowercase = characterSet(FIELD.lowercase, FIELD.lowercaseUsable)
    const number = characterSet(FIELD.number, FIELD.numberUsable)
    const specialCharacter = characterSet(FIELD.specialCharacter, FIELD.specialCharacterUsable)
    const combinationMin = integer(FIELD.combinationMin)
    const combinationOf = checkboxes(FIELD.combinationOf, Object.keys(CHECKBOX.combinationOf)).map((option) => CHECKBOX.combinationOf[option]!)
    const forbiddenCharacters = string(FIELD.forbiddenCharacters)
    const maxRepeat = integer(FIELD.maxRepeat)
    const maxSequence = integer(FIELD.maxSequence)
    const noId = checkboxes(FIELD.noId, [CHECKBOX.noId]).length > 0
    const lengthMin = integer(FIELD.lengthMin)
    const lengthMax = integer(FIELD.lengthMax)

    if (ref) {
        if (filled) problems.push(`**${FIELD.ref}**: leave every other rule field empty when you reuse another entry's rule.`)
        return {rule: {$ref: ref}, problems}
    }

    if (combinationOf.length && combinationMin === undefined) {
        problems.push(`**${FIELD.combinationMin}**: fill it in, or uncheck **${FIELD.combinationOf}**.`)
    }

    const rule: Rule = {}
    if (alphabetRequired || uppercase || lowercase) {
        rule.alphabet = {require: alphabetRequired}
        if (uppercase) rule.alphabet.uppercase = uppercase
        if (lowercase) rule.alphabet.lowercase = lowercase
    }
    if (number) rule.number = number
    if (specialCharacter) rule.specialCharacter = specialCharacter
    if (combinationMin !== undefined) {
        rule.combination = {min: combinationMin}
        if (combinationOf.length) rule.combination.of = combinationOf
    }
    if (forbiddenCharacters !== undefined || maxRepeat !== undefined || maxSequence !== undefined || noId) {
        rule.forbidden = {}
        if (forbiddenCharacters !== undefined) rule.forbidden.characters = forbiddenCharacters
        if (maxRepeat !== undefined) rule.forbidden.maxRepeat = maxRepeat
        if (maxSequence !== undefined) rule.forbidden.maxSequence = maxSequence
        if (noId) rule.forbidden.id = true
    }
    if (lengthMin !== undefined || lengthMax !== undefined) {
        rule.length = {}
        if (lengthMin !== undefined) rule.length.min = lengthMin
        if (lengthMax !== undefined) rule.length.max = lengthMax
    }
    return {rule: filled ? rule : null, problems}
}

const ruleFile = (domain: string) => path.join(databasesPath, domain, 'rule.json')

const readJson = (domain: string): unknown => {
    try {
        return JSON.parse(fs.readFileSync(ruleFile(domain)).toString())
    } catch {
        return undefined
    }
}

const EMPTY_RULE = `**Rule**: fill at least one rule field, **${FIELD.ref}** or **${FIELD.rule}**.`

// Returns the rule file contents to write, or the problems that stop the request.
export const buildRule = (sections: Record<string, string>): { domain: string, action: 'add' | 'update', json: string } | { problems: string[] } => {
    const problems: string[] = []

    const input = sections['Domain'] ?? ''
    const domain = normalizeDomain(input)
    if (!domain) problems.push(`**Domain**: \`${input}\` is not a host name such as \`nid.naver.com\`.`)

    const type = sections['Request type'] ?? ''
    const exists = domain !== null && fs.existsSync(ruleFile(domain))
    if (domain && type.startsWith('Add') && exists) {
        problems.push(`**Request type**: \`${domain}\` already has a rule. Choose "Change an existing rule".`)
    }
    if (domain && type.startsWith('Change') && !exists) {
        problems.push(`**Request type**: \`${domain}\` has no rule yet. Choose "Add a new site".`)
    }

    // The rule comes from the Rule JSON field when it is filled, and from the rule fields otherwise.
    const ruleJson = stripCodeFences(sections[FIELD.rule] ?? '')
    const fields = ruleFromFields(sections)
    let rule: unknown
    let source: string
    if (ruleJson) {
        source = FIELD.rule
        if (fields.rule !== null) {
            problems.push(`**${FIELD.rule}**: fill either this or the rule fields above, not both.`)
            return {problems}
        }
        // a rule field can hold something unreadable (an edited checkbox line) without counting as filled
        if (fields.problems.length) {
            problems.push(...fields.problems)
            return {problems}
        }
        try {
            rule = JSON.parse(ruleJson)
        } catch (error) {
            problems.push(`**${FIELD.rule}**: not valid JSON (${(error as Error).message}).`)
            return {problems}
        }
        // `validateRule` accepts `{}`, but a request that limits nothing is the same as an empty form
        if (isObject(rule) && Object.keys(rule).length === 0) {
            problems.push(EMPTY_RULE)
            return {problems}
        }
    } else {
        problems.push(...fields.problems)
        if (fields.rule === null) {
            problems.push(EMPTY_RULE)
            return {problems}
        }
        if (fields.problems.length) return {problems}
        rule = fields.rule
        source = '$ref' in fields.rule ? FIELD.ref : 'Rule'
    }

    if (isObject(rule) && '$ref' in rule) {
        // stored normalized, like the folder names, so `Accounts.Kakao.com.` finds `accounts.kakao.com`
        const target = typeof rule.$ref === 'string' ? normalizeDomain(rule.$ref) : null
        if (target) rule = {...rule, $ref: target}
        if (Object.keys(rule as object).length !== 1) problems.push(`**${source}**: a \`$ref\` rule must have no other keys.`)
        if (!target) {
            problems.push(`**${source}**: \`$ref\` must be a domain name.`)
        } else if (target === domain) {
            problems.push(`**${source}**: \`$ref\` points to itself.`)
        } else {
            const resolved = readJson(target)
            if (resolved === undefined) problems.push(`**${source}**: \`$ref\` points to \`${target}\`, which has no rule.`)
            else if (isObject(resolved) && '$ref' in resolved) problems.push(`**${source}**: \`${target}\` is itself a \`$ref\`. Point to \`${resolved.$ref}\` instead.`)
        }
    } else {
        problems.push(...validateRule(rule).map((problem) => `**${source}**: \`${problem}\``))
    }

    if (problems.length || !domain) return {problems}
    const json = JSON.stringify(rule, null, 2) + '\n'
    if (exists && fs.readFileSync(ruleFile(domain)).toString() === json) {
        return {problems: [`**${source}**: same as the current rule of \`${domain}\`, nothing to change.`]}
    }
    return {domain, action: exists ? 'update' : 'add', json}
}

const pullRequestBody = (sections: Record<string, string>, issue: string) => [
    `Generated from #${issue} by the rule request workflow. Merging does not close the issue, since the base is \`develop\`.`,
    '',
    '### Site guidance',
    '',
    sections['Password guidance on the site'] || '(none given)',
    '',
    '### Page checked',
    '',
    sections['Page checked'] || '(none given)',
    '',
    '### Before merging',
    '',
    '- [ ] The guidance and screenshots in the issue match the rule.',
    '- [ ] `bun test` passes (the workflow already ran the rule tests).',
].join('\n') + '\n'

if (import.meta.main) {
    const body = process.env.ISSUE_BODY ?? ''
    const issue = process.env.ISSUE_NUMBER ?? ''
    const repositoryUrl = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY ?? 'startergate/zero-password-db'}`
    const sections = parseIssueBody(body)
    const result = buildRule(sections)
    if ('problems' in result) {
        const message = [
            'The rule request could not be turned into a pull request:',
            '',
            ...result.problems.map((problem) => `- ${problem}`),
            '',
            `Edit the issue to fix them and the workflow will run again. See [CONTRIBUTING.md](${repositoryUrl}/blob/develop/CONTRIBUTING.md) for the rule format.`,
        ].join('\n') + '\n'
        if (process.env.ERRORS_FILE) fs.writeFileSync(process.env.ERRORS_FILE, message)
        console.error(message)
        process.exit(1)
    }
    fs.mkdirSync(path.dirname(ruleFile(result.domain)), {recursive: true})
    fs.writeFileSync(ruleFile(result.domain), result.json)
    if (process.env.PR_BODY_FILE) fs.writeFileSync(process.env.PR_BODY_FILE, pullRequestBody(sections, issue))
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `domain=${result.domain}\naction=${result.action}\n`)
    console.log(`${result.action} databases/${result.domain}/rule.json`)
}
