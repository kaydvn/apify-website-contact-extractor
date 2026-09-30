import { Actor, log } from 'apify';
import { extractFromPage, hasContacts, mergeResults, normalizeStartUrl, pickContactPages, robotsAllows } from './lib.js';

const EVENT = 'domain';
const UA = 'Mozilla/5.0 (compatible; contact-extractor/1.0; Apify actor; +https://apify.com/mmaker-bot)';

async function fetchHtml(url, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' } });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || (type && !/html|xml|text\/plain/i.test(type))) return { status: res.status, finalUrl: res.url, html: null };
        const buf = await res.arrayBuffer();
        return { status: res.status, finalUrl: res.url, html: Buffer.from(buf.slice(0, 3_000_000)).toString('utf8') };
    } catch (err) {
        return { status: 0, finalUrl: url, html: null, error: err.name === 'AbortError' ? 'timeout' : err.message };
    } finally {
        clearTimeout(t);
    }
}

async function processSite(startUrl, opts) {
    const home = await fetchHtml(startUrl, opts.timeoutMs);
    if (!home.html) {
        return { domain: new URL(startUrl).hostname.replace(/^www\./, ''), url: startUrl, error: home.error || `HTTP ${home.status}`, emails: [], phones: [] };
    }
    const base = home.finalUrl || startUrl;
    const origin = new URL(base).origin;
    let robots = null;
    if (opts.respectRobots) {
        const r = await fetchHtml(`${origin}/robots.txt`, opts.timeoutMs);
        robots = r.status === 200 ? r.html : null;
    }
    const first = { ...extractFromPage(home.html, base), url: base };
    const extra = pickContactPages(first.internalLinks, base, opts.maxPagesPerSite - 1)
        .filter((u) => robotsAllows(robots, new URL(u).pathname));
    const pages = [first];
    for (const u of extra) {
        const p = await fetchHtml(u, opts.timeoutMs);
        if (p.html) pages.push({ ...extractFromPage(p.html, p.finalUrl || u), url: p.finalUrl || u });
    }
    return mergeResults(base, pages, { emailDomainOnly: opts.emailDomainOnly });
}

await Actor.init();
const input = (await Actor.getInput()) || {};
const raw = [...(input.urls || []), ...(input.startUrls || []).map((s) => (typeof s === 'string' ? s : s?.url))];
const seen = new Set();
const urls = [];
for (const r of raw) {
    const u = normalizeStartUrl(r);
    if (!u) continue;
    const key = new URL(u).hostname.replace(/^www\./, '');
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(u);
}
if (!urls.length) throw new Error('Give at least one website URL or domain in "urls".');

const opts = {
    maxPagesPerSite: Math.min(Math.max(Number(input.maxPagesPerSite) || 5, 1), 15),
    timeoutMs: Math.min(Math.max(Number(input.timeoutSecs) || 15, 3), 60) * 1000,
    respectRobots: input.respectRobots !== false,
    emailDomainOnly: Boolean(input.emailDomainOnly),
};
const onlyWithContacts = input.onlyWithContacts !== false;
const concurrency = Math.min(Math.max(Number(input.concurrency) || 10, 1), 50);
log.info(`Scanning ${urls.length} websites (up to ${opts.maxPagesPerSite} pages each, concurrency ${concurrency})`);

let done = 0;
let found = 0;
let limitReached = false;
let next = 0;
async function worker() {
    while (next < urls.length && !limitReached) {
        const url = urls[next++];
        let row;
        try {
            row = await processSite(url, opts);
        } catch (err) {
            row = { url, error: err.message, emails: [], phones: [] };
        }
        done++;
        const ok = !row.error && hasContacts(row);
        if (ok) {
            found++;
            // Charge only for websites where at least one contact was found.
            const charge = await Actor.pushData(row, EVENT);
            if (charge?.eventChargeLimitReached) limitReached = true;
        } else if (!onlyWithContacts) {
            await Actor.pushData(row);
        }
        if (done % 10 === 0) await Actor.setStatusMessage(`Scanned ${done}/${urls.length} websites, ${found} with contacts`);
    }
}
await Promise.all(Array.from({ length: concurrency }, worker));

if (limitReached) log.info('Stopped at the maximum charge set for this run.');
await Actor.setStatusMessage(`Finished: ${found} of ${done} websites had contacts`, { isStatusMessageTerminal: true });
await Actor.exit();
