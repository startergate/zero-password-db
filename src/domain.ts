// Second-level labels under which registrations happen one level deeper (e.g. "example.co.kr").
// A small subset of the Public Suffix List covering the sites this database targets.
const MULTI_LABEL_SUFFIXES = new Set([
    // Korea
    'co.kr', 'ne.kr', 'or.kr', 're.kr', 'pe.kr', 'go.kr', 'mil.kr', 'ac.kr', 'hs.kr', 'ms.kr', 'es.kr', 'sc.kr', 'kg.kr',
    'seoul.kr', 'busan.kr', 'daegu.kr', 'incheon.kr', 'gwangju.kr', 'daejeon.kr', 'ulsan.kr', 'gyeonggi.kr',
    'gangwon.kr', 'chungbuk.kr', 'chungnam.kr', 'jeonbuk.kr', 'jeonnam.kr', 'gyeongbuk.kr', 'gyeongnam.kr', 'jeju.kr',
    // Others commonly seen
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
    'com.cn', 'net.cn', 'org.cn', 'com.tw', 'com.hk', 'com.au', 'net.au', 'org.au', 'com.br', 'co.nz', 'co.in',
])

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

// Lowercases a host name and drops a trailing dot. Returns null for anything that is not a host name
// with at least two labels (paths, ports, "..", single labels like "localhost" and non-ASCII input).
export const normalizeDomain = (input: string): string | null => {
    const domain = input.trim().toLowerCase().replace(/\.$/, '')
    if (domain.length > 253) return null
    const labels = domain.split('.')
    if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null
    return domain
}

// The part of a host name that can be registered, e.g. "coupang.com" for "login.coupang.com".
const registrableLabelCount = (labels: string[]) =>
    MULTI_LABEL_SUFFIXES.has(labels.slice(-2).join('.')) ? 3 : 2

// Database entries to try for a host name, most specific first:
// the host itself, its parent domains down to the registrable domain, then "www." + the registrable domain.
// For example "login.coupang.com" → ["login.coupang.com", "coupang.com", "www.coupang.com"]. Empty for invalid input.
export const candidateDomains = (input: string): string[] => {
    const domain = normalizeDomain(input)
    if (!domain) return []
    const labels = domain.split('.')
    // IPv4 addresses and hosts that are (or sit above) a public suffix have no parents to try
    const minLabels = registrableLabelCount(labels)
    if (/^[0-9]+$/.test(labels.at(-1)!) || labels.length < minLabels) return [domain]
    const candidates: string[] = []
    for (let i = 0; labels.length - i >= minLabels; i++) candidates.push(labels.slice(i).join('.'))
    const www = `www.${candidates.at(-1)}`
    if (!candidates.includes(www)) candidates.push(www)
    return candidates
}
