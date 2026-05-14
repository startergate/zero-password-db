import * as fs from "node:fs";

const getRuleFrom0PasswordDB = (domain: string, referenceMode?: boolean) => {
    let buffer
    try {
        buffer = fs.readFileSync(`../databases/${domain}/rule.json`)
    } catch (error) {
        return null
    }
    const text = buffer.toString()
    if (!text) return null
    let data
    try {
        data = JSON.parse(text)
    } catch (e) {
        return null
    }
    if (data['$ref']) {
        if (referenceMode) return null
        else return getRuleFrom0PasswordDB(data['$ref'])
    }
    return data
}

export default getRuleFrom0PasswordDB