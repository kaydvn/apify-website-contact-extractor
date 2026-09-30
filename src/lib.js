// Pure helpers for the website contact extractor. No network access here.

const SOCIAL_PATTERNS = {
    linkedin: /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(company|in|school|showcase)\/[^/?#\s]+/i,
    facebook: /^https?:\/\/(www\.|m\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\b|login)[^?#\s]+/i,
    instagram: /^https?:\/\/(www\.)?instagram\.com\/(?!p\/|explore|reel\/)[A-Za-z0-9_.]+/i,
    twitter: /^https?:\/\/(www\.)?(twitter|x)\.com\/(?!intent|share|home|search|hashtag)[A-Za-z0-9_]{1,15}\/?$/i,
    youtube: /^https?:\/\/(www\.)?youtube\.com\/(channel\/|c\/|user\/|@)[^/?#\s]+/i,
    tiktok: /^https?:\/\/(www\.)?tiktok\.com\/@[^/?#\s]+/i,
    github: /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9-]+\/?$/i,
    pinterest: /^https?:\/\/([a-z]{2}\.)?pinterest\.[a-z.]+\/(?!pin\/)[A-Za-z0-9_]+\/?$/i,
};

const CONTACT_PAGE_HINT = /(contact|kontakt|contatt|contacto|about|a-propos|uber-uns|ueber-uns|impressum|imprint|legal|mentions|team|staff|support|reach|location|office)/i;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;
const BAD_EMAIL_TLD = /\.(png|jpe?g|gif|webp|svg|css|js|avif|ico|woff2?)$/i;
const PLACEHOLDER_EMAIL = /^(you|your|name|email|user|example|test|john|jane)(\.?[a-z]*)?@|@(example|domain|email|yourdomain|sentry|wixpress|sentry-next)\./i;

export function normalizeStartUrl(raw) {
    let s = String(raw || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    try {
        const u = new URL(s);
        if (!u.hostname.includes('.')) return null;
        u.hash = '';
        return u.href;
    } catch {
        return null;
    }
}

export function rootDomain(hostname) {
    return String(hostname).toLowerCase().replace(/^www\./, '');
}

export function decodeCfEmail(hex) {
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 4 || hex.length % 2) return null;
    const key = parseInt(hex.slice(0, 2), 16);
    let out = '';
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
    return out;
}

function decodeEntities(s) {
    return s
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

export function cleanEmail(e) {
    const email = decodeURIComponent(String(e)).trim().toLowerCase().replace(/^mailto:/, '').split('?')[0].replace(/[.,;:]+$/, '');
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(email)) return null;
    if (BAD_EMAIL_TLD.test(email) || PLACEHOLDER_EMAIL.test(email)) return null;
    if (/^[0-9a-f]{16,}@/.test(email)) return null; // tracking hashes (e.g. Sentry DSNs)
    return email;
}

export function cleanPhone(raw) {
    let p = decodeURIComponent(String(raw)).replace(/^tel:/i, '').trim();
    p = p.replace(/[^\d+()\-.\s/]/g, '').replace(/\s+/g, ' ').trim();
    const digits = p.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    return p;
}

function extractLinks(html, baseUrl) {
    const links = [];
    const re = /<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    let m;
    while ((m = re.exec(html))) {
        const href = decodeEntities((m[2] ?? m[3] ?? m[4] ?? '').trim());
        if (href) links.push(href);
    }
    return links.map((href) => {
        if (/^(mailto|tel):/i.test(href)) return href;
        try {
            return new URL(href, baseUrl).href;
        } catch {
            return null;
        }
    }).filter(Boolean);
}

function extractJsonLd(html) {
    const out = { emails: [], phones: [], sameAs: [], name: null, address: null };
    const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(visit);
        if (typeof node.email === 'string') out.emails.push(node.email);
        if (typeof node.telephone === 'string') out.phones.push(node.telephone);
        if (Array.isArray(node.sameAs)) out.sameAs.push(...node.sameAs.filter((s) => typeof s === 'string'));
        else if (typeof node.sameAs === 'string') out.sameAs.push(node.sameAs);
        const type = [].concat(node['@type'] || []).join(' ');
        if (/Organization|LocalBusiness|Corporation|Store|Restaurant/i.test(type)) {
            if (!out.name && typeof node.name === 'string') out.name = node.name;
            const a = node.address;
            if (!out.address && a && typeof a === 'object') {
                out.address = [a.streetAddress, a.postalCode, a.addressLocality, a.addressRegion, a.addressCountry?.name ?? a.addressCountry]
                    .filter((x) => typeof x === 'string' && x.trim()).join(', ') || null;
            }
        }
        for (const v of Object.values(node)) if (v && typeof v === 'object') visit(v);
    };
    while ((m = re.exec(html))) {
        try {
            visit(JSON.parse(m[1].trim()));
        } catch { /* malformed JSON-LD is common; ignore */ }
    }
    return out;
}

// Extract contacts from one HTML page. Returns arrays (may contain duplicates across pages; merge dedupes).
export function extractFromPage(html, pageUrl) {
    const text = decodeEntities(html);
    const links = extractLinks(html, pageUrl);
    const emails = [];
    const phones = [];
    const socials = {};
    const internal = [];
    const host = rootDomain(new URL(pageUrl).hostname);

    for (const l of links) {
        if (/^mailto:/i.test(l)) emails.push(l);
        else if (/^tel:/i.test(l)) phones.push(l);
        else {
            try {
                const u = new URL(l);
                if (rootDomain(u.hostname) !== host) {
                    for (const [net, re] of Object.entries(SOCIAL_PATTERNS)) {
                        if (re.test(l)) (socials[net] ||= []).push(l.split(/[?#]/)[0].replace(/\/$/, ''));
                    }
                }
                if (rootDomain(u.hostname) === host && /^https?:$/.test(u.protocol)) internal.push(u.origin + u.pathname);
            } catch { /* ignore */ }
        }
    }
    for (const m of html.matchAll(/data-cfemail="([0-9a-f]+)"/gi)) emails.push(decodeCfEmail(m[1]));
    for (const m of html.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)) emails.push(decodeCfEmail(m[1]));
    const visible = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
    emails.push(...(visible.match(EMAIL_RE) || []));

    const ld = extractJsonLd(html);
    emails.push(...ld.emails);
    phones.push(...ld.phones);
    for (const s of ld.sameAs) {
        for (const [net, re] of Object.entries(SOCIAL_PATTERNS)) if (re.test(s)) (socials[net] ||= []).push(s.replace(/\/$/, ''));
    }
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    return {
        emails: emails.filter(Boolean).map(cleanEmail).filter(Boolean),
        phones: phones.map(cleanPhone).filter(Boolean),
        socials,
        internalLinks: internal,
        title: title ? decodeEntities(title) : null,
        orgName: ld.name,
        address: ld.address,
    };
}

// Choose up to `max` internal pages likely to hold contact data, contact pages first.
export function pickContactPages(internalLinks, startUrl, max) {
    const start = new URL(startUrl);
    const seen = new Set([start.origin + start.pathname]);
    const scored = [];
    for (const l of internalLinks) {
        if (seen.has(l)) continue;
        seen.add(l);
        const path = new URL(l).pathname;
        if (/\.(pdf|jpe?g|png|gif|zip|docx?|xlsx?|mp4|svg|webp)$/i.test(path)) continue;
        const m = path.match(CONTACT_PAGE_HINT);
        if (!m) continue;
        const score = /contact|kontakt|contatt|contacto/i.test(m[1]) ? 0 : /impressum|imprint|legal|mentions/i.test(m[1]) ? 1 : 2;
        scored.push({ l, score: score * 100 + path.length });
    }
    return scored.sort((a, b) => a.score - b.score).slice(0, max).map((s) => s.l);
}

function uniq(arr) {
    return [...new Set(arr)];
}

export function mergeResults(startUrl, pages, { emailDomainOnly = false } = {}) {
    const host = rootDomain(new URL(startUrl).hostname);
    let emails = uniq(pages.flatMap((p) => p.emails));
    if (emailDomainOnly) emails = emails.filter((e) => e.endsWith(`@${host}`) || e.endsWith(`.${host}`));
    const phoneByDigits = new Map();
    for (const p of pages.flatMap((pg) => pg.phones)) {
        const d = p.replace(/\D/g, '');
        if (!phoneByDigits.has(d)) phoneByDigits.set(d, p);
    }
    const socials = {};
    for (const net of Object.keys(SOCIAL_PATTERNS)) {
        const all = uniq(pages.flatMap((p) => p.socials[net] || []));
        socials[net] = all[0] || null;
        if (all.length > 1) socials[`${net}All`] = all.slice(0, 5);
    }
    const home = pages[0] || {};
    return {
        domain: host,
        url: startUrl,
        companyName: pages.map((p) => p.orgName).find(Boolean) || null,
        title: home.title || null,
        emails,
        emailOnDomain: emails.filter((e) => e.endsWith(`@${host}`))[0] || null,
        phones: [...phoneByDigits.values()],
        address: pages.map((p) => p.address).find(Boolean) || null,
        linkedin: socials.linkedin,
        facebook: socials.facebook,
        instagram: socials.instagram,
        twitter: socials.twitter,
        youtube: socials.youtube,
        tiktok: socials.tiktok,
        github: socials.github,
        pinterest: socials.pinterest,
        otherSocials: Object.fromEntries(Object.entries(socials).filter(([k, v]) => k.endsWith('All') && v)),
        pagesScanned: pages.map((p) => p.url).filter(Boolean),
    };
}

export function hasContacts(row) {
    return Boolean(row.emails.length || row.phones.length || row.linkedin || row.facebook || row.instagram || row.twitter || row.youtube || row.tiktok);
}

// Minimal robots.txt check for our user agent group or '*'.
export function robotsAllows(robotsTxt, path, agent = 'contact-extractor') {
    if (!robotsTxt) return true;
    const groups = [];
    let cur = null;
    for (const raw of robotsTxt.split(/\r?\n/)) {
        const line = raw.replace(/#.*/, '').trim();
        const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
        if (!m) continue;
        const key = m[1].toLowerCase();
        if (key === 'user-agent') {
            if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [] }));
            cur.agents.push(m[2].toLowerCase());
        } else if (cur && (key === 'allow' || key === 'disallow')) {
            cur.rules.push({ allow: key === 'allow', path: m[2] });
        }
    }
    const group = groups.find((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)))
        || groups.find((g) => g.agents.includes('*'));
    if (!group) return true;
    let best = null;
    for (const r of group.rules) {
        if (!r.path) continue;
        const re = new RegExp(`^${r.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}`);
        if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
    }
    return best ? best.allow : true;
}
