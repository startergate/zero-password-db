import * as fs from "node:fs";
import path from "path";
import type {Rule, RuleMatch, RuleReference} from "./types.js";
import {resolveReference} from "./reference.js";

export type * from "./types.js";

const readRuleFile = (domain: string): Rule | RuleReference | null => {
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
export const findRule = (domain: string): RuleMatch | null => {
    const rule = resolveReference(readRuleFile(domain), readRuleFile)
    if (!rule) return null
    return {domain, rule}
}

export const getRule = (domain: string): Rule | null => findRule(domain)?.rule ?? null
