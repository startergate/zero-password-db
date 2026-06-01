import * as fs from "node:fs";
import path from "path";

type CharacterSetRule = {
    allow: boolean
    require: boolean
    usable?: string
}

type Rule = {
    alphabetUppercase?: CharacterSetRule
    alphabetLowercase?: CharacterSetRule
    number?: CharacterSetRule
    specialCharacter?: CharacterSetRule
    length?: {
        min?: number
        max?: number
    }
}

type RuleReference = {
    $ref: string
}

const getRuleFrom0PasswordDB = (domain: string, {referenceMode}: {
    referenceMode?: boolean, // Reference mode flag to prevent loop
    allowOnlineSync?: boolean // Online sync option flag (WIP)
} = {}) => {
    // TODO: Add Online Mode
    let buffer
    try {
        const rulePath = path.join(path.dirname(import.meta.url.replace(/^file:/, '')), '..', 'databases', domain, 'rule.json')
        buffer = fs.readFileSync(rulePath)
    } catch (error) {
        return null
    }
    const text = buffer.toString()
    if (!text) return null
    let data: Rule & RuleReference
    try {
        data = JSON.parse(text)
    } catch (e) {
        return null
    }
    if (data['$ref']) {
        if (referenceMode) return null
        else return getRuleFrom0PasswordDB(data['$ref'], {referenceMode: true})
    }
    return data
}

export default getRuleFrom0PasswordDB