import * as fs from "node:fs";
import path from "path";
import {normalizeDomain} from "../src/domain";
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
    while (/^```[a-z]*\n[\s\S]*\n```$/.test(value)) value = value.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '').trim()
    return value
}

const ruleFile = (domain: string) => path.join(databasesPath, domain, 'rule.json')

const readJson = (domain: string): unknown => {
    try {
        return JSON.parse(fs.readFileSync(ruleFile(domain)).toString())
    } catch {
        return undefined
    }
}

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

    let rule: unknown
    try {
        rule = JSON.parse(stripCodeFences(sections['Rule JSON'] ?? ''))
    } catch (error) {
        problems.push(`**Rule JSON**: not valid JSON (${(error as Error).message}).`)
        return {problems}
    }

    if (isObject(rule) && '$ref' in rule) {
        const target = rule.$ref
        if (Object.keys(rule).length !== 1) problems.push('**Rule JSON**: a `$ref` rule must have no other keys.')
        if (typeof target !== 'string' || !normalizeDomain(target)) {
            problems.push('**Rule JSON**: `$ref` must be a domain name.')
        } else if (target === domain) {
            problems.push('**Rule JSON**: `$ref` points to itself.')
        } else {
            const resolved = readJson(target)
            if (resolved === undefined) problems.push(`**Rule JSON**: \`$ref\` points to \`${target}\`, which has no rule.`)
            else if (isObject(resolved) && '$ref' in resolved) problems.push(`**Rule JSON**: \`${target}\` is itself a \`$ref\`. Point to \`${resolved.$ref}\` instead.`)
        }
    } else {
        problems.push(...validateRule(rule).map((problem) => `**Rule JSON**: \`${problem}\``))
    }

    if (problems.length || !domain) return {problems}
    const json = JSON.stringify(rule, null, 2) + '\n'
    if (exists && fs.readFileSync(ruleFile(domain)).toString() === json) {
        return {problems: [`**Rule JSON**: same as the current rule of \`${domain}\`, nothing to change.`]}
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
