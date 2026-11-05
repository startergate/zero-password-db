import * as fs from "node:fs";
import path from "path";
import type {Rule, RuleMatch, RuleReference} from "./types.js";
import {resolveReference} from "./reference.js";
import {candidateDomains, normalizeDomain} from "./domain.js";

export type * from "./types.js";
export {candidateDomains, normalizeDomain} from "./domain.js";
export {CHARACTER_CLASSES, characterClassOf, checkPassword} from "./check.js";

const readRuleFile = (input: string): Rule | RuleReference | null => {
    // only host names reach the file system, so "../" cannot escape `databases/`
    const domain = normalizeDomain(input)
    if (!domain) return null
    let text
    try {
        const rulePath = path.join(path.dirname(import.meta.url.replace(/^file:/, '')), '..', 'databases', domain, 'rule.json')
        text = fs.readFileSync(rulePath).toString()
    } catch (error) {
        return null
    }
    if (!text) return null
    try {
        return JSON.parse(text)
    } catch (e) {
        return null
    }
}

// Full version: reads the bundled `databases/` directory.
// Tries the entries from candidateDomains() in order, so "login.coupang.com" finds "www.coupang.com".
export const findRule = (domain: string): RuleMatch | null => {
    for (const candidate of candidateDomains(domain)) {
        const rule = resolveReference(readRuleFile(candidate), readRuleFile)
        if (rule) return {domain: candidate, rule}
    }
    return null
}

export const getRule = (domain: string): Rule | null => findRule(domain)?.rule ?? null
