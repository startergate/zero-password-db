import {expect, test} from "bun:test";
import {buildRule, CHARACTER_SET_OPTION, CHECKBOX, FIELD, parseCheckboxes, parseIssueBody} from "./rule-request";

const body = (fields: Record<string, string>) => Object.entries(fields)
    .map(([label, value]) => `### ${label}\n\n${value}`).join('\n\n')

const request = (fields: Record<string, string>) => buildRule(parseIssueBody(body({
    'Domain': 'example.com',
    'Request type': 'Add a new site',
    'Password guidance on the site': '영문, 숫자 포함 8~16자',
    'Page checked': '_No response_',
    'Rule JSON': '```json\n{"length": {"min": 8, "max": 16}}\n```',
    ...fields,
})))

test("parses issue form sections", () => {
    expect(parseIssueBody("### Domain\n\nExample.com\n\n### Page checked\n\n_No response_\n"))
        .toEqual({'Domain': 'Example.com', 'Page checked': ''})
})

test("builds a new rule file", () => {
    expect(request({'Domain': 'Example.COM'})).toEqual({
        domain: 'example.com',
        action: 'add',
        json: '{\n  "length": {\n    "min": 8,\n    "max": 16\n  }\n}\n',
    })
    expect(request({'Rule JSON': '```json\n```json\n{"$ref": "accounts.kakao.com"}\n```\n```'}))
        .toMatchObject({domain: 'example.com', action: 'add'})
})

test("updates an existing rule", () => {
    expect(request({'Domain': 'nid.naver.com', 'Request type': 'Change an existing rule'}))
        .toMatchObject({domain: 'nid.naver.com', action: 'update'})
})

test("reports problems", () => {
    expect(request({'Domain': '../etc'})).toMatchObject({problems: ['**Domain**: `../etc` is not a host name such as `nid.naver.com`.']})
    expect(request({'Domain': 'nid.naver.com'})).toMatchObject({problems: [expect.stringContaining('already has a rule')]})
    expect(request({'Request type': 'Change an existing rule'})).toMatchObject({problems: [expect.stringContaining('has no rule yet')]})
    expect(request({'Rule JSON': '{"length": '})).toMatchObject({problems: [expect.stringContaining('not valid JSON')]})
    expect(request({'Rule JSON': '{"lenght": {"min": 8}}'})).toEqual({problems: ['**Rule JSON**: `lenght: unknown key`']})
    expect(request({'Rule JSON': '{"$ref": "daum.net"}'})).toMatchObject({problems: [expect.stringContaining('is itself a `$ref`')]})
    expect(request({'Rule JSON': '{"$ref": "nowhere.example"}'})).toMatchObject({problems: [expect.stringContaining('has no rule')]})
})

test("refuses a change that changes nothing", async () => {
    const current = await Bun.file(`${import.meta.dir}/../databases/nid.naver.com/rule.json`).text()
    expect(request({'Domain': 'nid.naver.com', 'Request type': 'Change an existing rule', 'Rule JSON': current}))
        .toMatchObject({problems: [expect.stringContaining('nothing to change')]})
})

const fields = (values: Record<string, string>) => request({'Rule JSON': '_No response_', ...values})
const ruleOf = (values: Record<string, string>) => {
    const result = fields(values)
    if ('problems' in result) throw new Error(result.problems.join('\n'))
    return JSON.parse(result.json)
}
const checkboxes = (checked: string[], all: string[]) => all.map((label) => `- [${checked.includes(label) ? 'X' : ' '}] ${label}`).join('\n')
const KINDS = Object.keys(CHECKBOX.combinationOf)

test("form labels match the issue template", async () => {
    const template = Bun.YAML.parse(await Bun.file(`${import.meta.dir}/../.github/ISSUE_TEMPLATE/rule-request.yml`).text()) as {
        body: {type: string, attributes: {label?: string, options?: (string | {label: string})[]}}[]
    }
    const labels = template.body.map((field) => field.attributes.label).filter(Boolean)
    for (const label of Object.values(FIELD)) expect(labels).toContain(label)
    const options = (label: string) => template.body.find((field) => field.attributes.label === label)!.attributes.options!
        .map((option) => typeof option === 'string' ? option : option.label)
    expect(options(FIELD.uppercase)).toEqual(Object.keys(CHARACTER_SET_OPTION))
    expect(options(FIELD.specialCharacter)).toEqual(Object.keys(CHARACTER_SET_OPTION))
    expect(options(FIELD.alphabetRequired)).toEqual([CHECKBOX.alphabetRequired])
    expect(options(FIELD.noId)).toEqual([CHECKBOX.noId])
    expect(options(FIELD.combinationOf)).toEqual(KINDS)
})

test("parses checkboxes", () => {
    expect(parseCheckboxes('- [X] Numbers\n- [ ] Uppercase letters\n- [x] Special characters'))
        .toEqual({checked: ['Numbers', 'Special characters'], unchecked: ['Uppercase letters'], unknown: []})
    expect(parseCheckboxes('')).toEqual({checked: [], unchecked: [], unknown: []})
    expect(parseCheckboxes('Numbers')).toEqual({checked: [], unchecked: [], unknown: ['Numbers']})
})

test("builds a rule from the fields in Rule key order", () => {
    const result = fields({
        [FIELD.lengthMax]: '16',
        [FIELD.lengthMin]: ' 8 ',
        [FIELD.uppercase]: 'Required',
        [FIELD.lowercase]: 'Allowed',
        [FIELD.number]: 'Not allowed',
        [FIELD.specialCharacter]: 'Allowed',
        [FIELD.specialCharacterUsable]: '!@#$',
        [FIELD.alphabetRequired]: checkboxes([CHECKBOX.alphabetRequired], [CHECKBOX.alphabetRequired]),
        [FIELD.combinationMin]: '2',
        [FIELD.combinationOf]: checkboxes(['Letters (either case counts as one kind)', 'Special characters'], KINDS),
        [FIELD.maxRepeat]: '2',
        [FIELD.maxSequence]: '3',
        [FIELD.forbiddenCharacters]: '<>',
        [FIELD.noId]: checkboxes([CHECKBOX.noId], [CHECKBOX.noId]),
    })
    expect(result).toEqual({
        domain: 'example.com',
        action: 'add',
        json: JSON.stringify({
            alphabet: {
                require: true,
                uppercase: {allow: true, require: true},
                lowercase: {allow: true, require: false},
            },
            number: {allow: false, require: false},
            specialCharacter: {allow: true, require: false, usable: '!@#$'},
            combination: {min: 2, of: ['alphabet', 'specialCharacter']},
            forbidden: {characters: '<>', maxRepeat: 2, maxSequence: 3, id: true},
            length: {min: 8, max: 16},
        }, null, 2) + '\n',
    })
})

test("leaves out fields that are not limited", () => {
    expect(ruleOf({[FIELD.lengthMin]: '8', [FIELD.uppercase]: 'No limit', [FIELD.noId]: checkboxes([], [CHECKBOX.noId])}))
        .toEqual({length: {min: 8}})
    expect(ruleOf({[FIELD.combinationMin]: '3', [FIELD.combinationOf]: checkboxes([], KINDS)}))
        .toEqual({combination: {min: 3}})
    expect(ruleOf({[FIELD.alphabetRequired]: checkboxes([CHECKBOX.alphabetRequired], [CHECKBOX.alphabetRequired])}))
        .toEqual({alphabet: {require: true}})
    expect(ruleOf({[FIELD.lowercase]: 'Allowed'})).toEqual({alphabet: {require: false, lowercase: {allow: true, require: false}}})
    expect(ruleOf({[FIELD.ref]: 'accounts.kakao.com'})).toEqual({$ref: 'accounts.kakao.com'})
})

test("reports problems in the fields", () => {
    expect(fields({})).toEqual({problems: ['**Rule**: fill at least one rule field, **Same rule as** or **Rule JSON**.']})
    expect(fields({[FIELD.lengthMin]: 'eight', [FIELD.maxRepeat]: '-1'})).toEqual({problems: [
        '**Longest repeat**: `-1` is not a whole number.',
        '**Minimum length**: `eight` is not a whole number.',
    ]})
    expect(fields({[FIELD.lengthMax]: '9007199254740993'})).toEqual({problems: ['**Maximum length**: `9007199254740993` is not a whole number.']})
    expect(fields({[FIELD.lengthMin]: '16', [FIELD.lengthMax]: '8'})).toEqual({problems: ['**Rule**: `length: min is greater than max`']})
    expect(fields({[FIELD.maxSequence]: '0'})).toEqual({problems: ['**Rule**: `forbidden.maxSequence: not a positive integer`']})
    expect(fields({[FIELD.combinationMin]: '3', [FIELD.combinationOf]: checkboxes(['Numbers', 'Special characters'], KINDS)}))
        .toEqual({problems: ['**Rule**: `combination.min: not between 1 and 2`']})
    expect(fields({[FIELD.combinationOf]: checkboxes(['Numbers'], KINDS)}))
        .toEqual({problems: ['**Combination minimum**: fill it in, or uncheck **Combination kinds**.']})
    expect(fields({[FIELD.numberUsable]: '123'})).toMatchObject({problems: [expect.stringContaining('to "Allowed" or "Required"')]})
    expect(fields({[FIELD.number]: 'Not allowed', [FIELD.numberUsable]: '123'})).toMatchObject({problems: [expect.stringContaining('to "Allowed" or "Required"')]})
    expect(fields({[FIELD.number]: 'Allowed', [FIELD.numberUsable]: '12a'})).toEqual({problems: ['**Rule**: `number.usable: "a" is not number`']})
    expect(fields({[FIELD.number]: 'Sometimes'})).toMatchObject({problems: [expect.stringContaining('is not an option')]})
})

test("takes the rule from one place only", () => {
    expect(fields({[FIELD.ref]: 'accounts.kakao.com', [FIELD.lengthMin]: '8'}))
        .toEqual({problems: ['**Same rule as**: leave every other rule field empty when you reuse another entry\'s rule.']})
    expect(request({[FIELD.lengthMin]: '8'})).toEqual({problems: ['**Rule JSON**: fill either this or the rule fields above, not both.']})
    expect(request({[FIELD.ref]: 'accounts.kakao.com'})).toMatchObject({problems: [expect.stringContaining('not both')]})
    expect(request({[FIELD.uppercase]: 'No limit', [FIELD.noId]: checkboxes([], [CHECKBOX.noId])})).toMatchObject({action: 'add'})
    expect(fields({[FIELD.ref]: 'daum.net'})).toEqual({problems: ['**Same rule as**: `daum.net` is itself a `$ref`. Point to `accounts.kakao.com` instead.']})
    expect(fields({[FIELD.ref]: 'example.com'})).toEqual({problems: ['**Same rule as**: `$ref` points to itself.']})
})

test("refuses fields that change nothing", () => {
    expect(fields({'Domain': 'daum.net', 'Request type': 'Change an existing rule', [FIELD.ref]: 'accounts.kakao.com'}))
        .toMatchObject({problems: [expect.stringContaining('nothing to change')]})
})

test("normalizes the $ref domain", () => {
    expect(ruleOf({[FIELD.ref]: 'Accounts.Kakao.COM.'})).toEqual({$ref: 'accounts.kakao.com'})
    expect(request({'Rule JSON': '{"$ref": "ACCOUNTS.kakao.com"}'})).toMatchObject({json: '{\n  "$ref": "accounts.kakao.com"\n}\n'})
})

test("refuses an empty Rule JSON like an empty form", () => {
    const empty = {problems: ['**Rule**: fill at least one rule field, **Same rule as** or **Rule JSON**.']}
    expect(request({'Rule JSON': '```json\n{}\n```'})).toEqual(empty)
    expect(request({'Rule JSON': '{ }'})).toEqual(empty)
})

test("reports an option checked more than once", () => {
    expect(fields({
        [FIELD.lengthMin]: '8',
        [FIELD.noId]: `- [X] ${CHECKBOX.noId}\n- [X] ${CHECKBOX.noId}\n- [x] ${CHECKBOX.noId}`,
        [FIELD.combinationMin]: '1',
        [FIELD.combinationOf]: '- [X] Numbers\n- [ ] Numbers\n- [X] Numbers',
    })).toEqual({problems: [
        '**Combination kinds**: `Numbers` is checked more than once.',
        '**Account id**: `The password must not contain the account id` is checked more than once.',
    ]})
})

test("reports unreadable rule fields next to Rule JSON", () => {
    expect(request({[FIELD.noId]: '- [X] Something else'}))
        .toEqual({problems: ['**Account id**: `Something else` is not an option of this field.']})
    expect(request({[FIELD.noId]: '- [ ] Something else'}))
        .toEqual({problems: ['**Account id**: `Something else` is not an option of this field.']})
    expect(request({[FIELD.lengthMin]: 'eight'})).toEqual({problems: ['**Rule JSON**: fill either this or the rule fields above, not both.']})
})
