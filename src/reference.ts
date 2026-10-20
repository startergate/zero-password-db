import type {Rule, RuleReference} from "./types.js";

export const isRuleReference = (data: Rule | RuleReference): data is RuleReference =>
    typeof (data as RuleReference).$ref === 'string'

// Follows a single level of `$ref`. A reference that points to another reference resolves to null to prevent loops.
export const resolveReference = (
    data: Rule | RuleReference | null,
    load: (domain: string) => Rule | RuleReference | null,
): Rule | null => {
    if (!data) return null
    if (!isRuleReference(data)) return data
    const target = load(data.$ref)
    if (!target || isRuleReference(target)) return null
    return target
}

