import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanEmail, cleanPhone, decodeCfEmail, extractFromPage, hasContacts, mergeResults, normalizeStartUrl, pickContactPages, robotsAllows } from '../src/lib.js';

const HOME = `<html><head><title>Acme &amp; Co</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme Co","telephone":"+1 415 555 0100",
"address":{"@type":"PostalAddress","streetAddress":"1 Main St","addressLocality":"San Francisco","addressCountry":"US"},
"sameAs":["https://www.linkedin.com/company/acme/","https://x.com/acmeco"]}</script></head>
<body><a href="/contact-us">Contact</a><a href="/about">About</a><a href="/blog/post-1">Blog</a><a href="/files/contact.pdf">pdf</a>
<a href="https://www.facebook.com/acmeco?ref=1">fb</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
<a href="https://twitter.com/intent/tweet">tweet</a><a href="mailto:Sales@Acme.com?subject=Hi">mail</a>
<a href="/cdn-cgi/l/email-protection#1c757d707d5c7d7f71793f727969">cf</a>
<img src="logo@2x.png"> <p>Write to support@acme.com or you@example.com</p>
<script>var dsn="https://abcdef0123456789abcdef@sentry.io/1"</script>
<a href="tel:+1-415-555-0100">call</a><a href="https://other.com/contact">ext</a></body></html>`;

test('normalizeStartUrl', () => {
    assert.equal(normalizeStartUrl('acme.com'), 'https://acme.com/');
    assert.equal(normalizeStartUrl(' http://www.acme.com/x#y '), 'http://www.acme.com/x');
    assert.equal(normalizeStartUrl('localhost'), null);
    assert.equal(normalizeStartUrl(''), null);
});

test('decodeCfEmail', () => {
    const key = 0x1c;
    const hex = key.toString(16) + [...'hi@a.co'].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('');
    assert.equal(decodeCfEmail(hex), 'hi@a.co');
    assert.equal(decodeCfEmail('zz'), null);
});

test('cleanEmail filters junk', () => {
    assert.equal(cleanEmail('mailto:Sales@Acme.com?subject=x'), 'sales@acme.com');
    assert.equal(cleanEmail('logo@2x.png'), null);
    assert.equal(cleanEmail('you@example.com'), null);
    assert.equal(cleanEmail('abcdef0123456789abcdef@sentry.io'), null);
});

test('cleanPhone', () => {
    assert.equal(cleanPhone('tel:+1-415-555-0100'), '+1-415-555-0100');
    assert.equal(cleanPhone('tel:123'), null);
});

test('extractFromPage finds emails, phones, socials, JSON-LD', () => {
    const p = extractFromPage(HOME, 'https://www.acme.com/');
    assert.ok(p.emails.includes('sales@acme.com'));
    assert.ok(p.emails.includes('support@acme.com'));
    assert.ok(!p.emails.some((e) => e.includes('example') || e.includes('sentry') || e.endsWith('.png')));
    assert.ok(p.phones.includes('+1 415 555 0100'));
    assert.deepEqual(p.socials.facebook, ['https://www.facebook.com/acmeco']);
    assert.deepEqual(p.socials.linkedin, ['https://www.linkedin.com/company/acme']);
    assert.deepEqual(p.socials.twitter, ['https://x.com/acmeco']);
    assert.equal(p.orgName, 'Acme Co');
    assert.equal(p.address, '1 Main St, San Francisco, US');
    assert.equal(p.title, 'Acme & Co');
    assert.ok(!p.internalLinks.some((l) => l.includes('other.com')));
});

test('pickContactPages prefers contact, skips files and non-matching', () => {
    const p = extractFromPage(HOME, 'https://www.acme.com/');
    assert.deepEqual(pickContactPages(p.internalLinks, 'https://www.acme.com/', 5), ['https://www.acme.com/contact-us', 'https://www.acme.com/about']);
    assert.deepEqual(pickContactPages(p.internalLinks, 'https://www.acme.com/', 1), ['https://www.acme.com/contact-us']);
});

test('mergeResults dedupes and flattens', () => {
    const a = { ...extractFromPage(HOME, 'https://www.acme.com/'), url: 'https://www.acme.com/' };
    const b = { ...extractFromPage('<a href="mailto:sales@acme.com">x</a><a href="tel:+14155550100">y</a><a href="mailto:bob@gmail.com">z</a>', 'https://www.acme.com/contact-us'), url: 'https://www.acme.com/contact-us' };
    const row = mergeResults('https://www.acme.com/', [a, b]);
    assert.equal(row.domain, 'acme.com');
    assert.equal(row.companyName, 'Acme Co');
    assert.equal(row.emails.filter((e) => e === 'sales@acme.com').length, 1);
    assert.equal(row.phones.length, 1);
    assert.equal(row.emailOnDomain, 'sales@acme.com');
    assert.equal(row.linkedin, 'https://www.linkedin.com/company/acme');
    assert.ok(hasContacts(row));
    const own = mergeResults('https://www.acme.com/', [a, b], { emailDomainOnly: true });
    assert.ok(!own.emails.includes('bob@gmail.com'));
    assert.ok(!hasContacts(mergeResults('https://x.io/', [{ emails: [], phones: [], socials: {}, url: 'https://x.io/' }])));
});

test('robotsAllows', () => {
    const txt = 'User-agent: *\nDisallow: /private\nAllow: /private/contact\n\nUser-agent: BadBot\nDisallow: /';
    assert.equal(robotsAllows(txt, '/contact'), true);
    assert.equal(robotsAllows(txt, '/private/x'), false);
    assert.equal(robotsAllows(txt, '/private/contact'), true);
    assert.equal(robotsAllows('User-agent: *\nDisallow: /', '/about'), false);
    assert.equal(robotsAllows('User-agent: *\nDisallow: /*.php$', '/a.php'), false);
    assert.equal(robotsAllows(null, '/x'), true);
});
