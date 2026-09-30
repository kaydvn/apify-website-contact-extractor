# Website Email & Contact Scraper - Emails, Phones, Socials

Paste a list of websites or domains and get **one clean row per company**, ready for a CRM or spreadsheet:

- **Emails**: from `mailto:` links, visible text, schema.org JSON-LD and Cloudflare-obfuscated addresses. Junk such as `logo@2x.png`, `you@example.com` and Sentry DSNs is filtered out.
- **Main email on the company's own domain** in its own column (`emailOnDomain`)
- **Phone numbers**: from `tel:` links and JSON-LD, deduplicated by digits (no random number strings scraped from the page text)
- **Social profiles**: LinkedIn, Facebook, Instagram, X/Twitter, YouTube, TikTok, GitHub and Pinterest (share buttons and intent links are ignored)
- **Company name and postal address** from schema.org Organization / LocalBusiness data
- The list of pages that were scanned, so every result can be checked

## Why this actor

- **You pay only for hits.** You are charged per website where at least one contact was found. Websites that are dead, blocked or empty cost nothing.
- **Fast and cheap.** It uses plain HTTP requests, with no headless browser. It checks the homepage plus the most likely contact pages (Contact, About, Impressum/Imprint, Legal, Team), with the contact page first.
- **One row per domain.** Duplicate domains in your input are merged, and results come flattened, so there is no post-processing.
- **Polite.** It respects robots.txt by default, identifies itself honestly in its User-Agent and uses a per-page timeout.

## Input

```json
{
  "urls": ["acme.com", "https://www.example.org"],
  "maxPagesPerSite": 5,
  "onlyWithContacts": true,
  "emailDomainOnly": false
}
```

## Output (one item per website)

```json
{
  "domain": "acme.com",
  "companyName": "Acme Co",
  "emailOnDomain": "sales@acme.com",
  "emails": ["sales@acme.com", "support@acme.com"],
  "phones": ["+1 415 555 0100"],
  "address": "1 Main St, San Francisco, US",
  "linkedin": "https://www.linkedin.com/company/acme",
  "facebook": "https://www.facebook.com/acmeco",
  "twitter": "https://x.com/acmeco",
  "pagesScanned": ["https://www.acme.com/", "https://www.acme.com/contact-us"]
}
```

Download the results as CSV, Excel or JSON, or pull them through the Apify API or integrations (Make, Zapier, n8n).

## Limits

- Websites that render contact details only with JavaScript can come back empty. You are not charged for those.
- Only publicly published contact details are collected. It does not guess or verify emails.

## Responsible use

You are responsible for using the data lawfully, including GDPR/CAN-SPAM and anti-spam rules in your jurisdiction and the terms of the websites you scan. Don't use it to send unsolicited bulk email.

## How to use
1. Paste websites or bare domains into `urls` (one per line; thousands are fine).
2. Optionally raise `maxPagesPerSite` for deeper scans, or turn on `emailDomainOnly` to keep only emails on the company's own domain.
3. Run, then export the dataset to CSV/Excel or send it to your CRM.

## Input parameters
| Field | Type | Description |
|---|---|---|
| `urls` | array | Websites or domains to scan |
| `maxPagesPerSite` | integer | Pages checked per site: homepage plus contact/about/imprint pages (default 5) |
| `onlyWithContacts` | boolean | Output only websites where a contact was found (default true) |
| `emailDomainOnly` | boolean | Keep only emails on the website's own domain |
| `respectRobots` | boolean | Obey robots.txt (default true) |
| `concurrency` | integer | Websites processed in parallel (default 10) |
| `timeoutSecs` | integer | Per-page timeout in seconds (default 15) |

## Sample inputs
**Two company sites**
```json
{"urls":["apify.com","crawlee.dev"],"maxPagesPerSite":5}
```
**Keep sites with no contacts in the output (still free)**
```json
{"urls":["example.com","example.org"],"onlyWithContacts":false}
```
**Faster, shallow pass over a long list**
```json
{"urls":["a.com","b.com","c.com"],"maxPagesPerSite":2,"concurrency":20,"timeoutSecs":10}
```

## Price guide
Pay per event: $0.002 per domain. Rough cost by volume:

| domains | Cost |
|---|---|
| 100 | $0.20 |
| 1,000 | $2.00 |
| 10,000 | $20.00 |
| 100,000 | $200.00 |

The Apify free plan includes monthly credit, enough to try it. Set a maximum charge per run in the run options to cap spend.

## FAQ
**How much does it cost?** $2 per 1,000 websites **where contacts were found**. Websites with no contacts, dead domains and blocked sites are free. You can try it with the free monthly credit of the Apify free plan.

**How is this different from a Google Maps scraper?** It starts from your own list of domains (for example from a CRM export, a directory or a tech-stack search), so you can enrich any company list, not just local businesses.

**Does it find personal emails or guess email patterns?** No. It collects only contact details that the website itself publishes.

**Can I combine it with other tools?** Yes. Pair it with the [Bulk Tech Stack Detector](https://apify.com/mmaker-bot/apify-bulk-tech-stack-detector) to find, for example, Shopify stores and then their contact emails. Use the Apify API, schedules, or Make, Zapier and n8n integrations.

**Why did a website return no emails?** Some websites show contacts only through JavaScript or a contact form. The actor uses plain HTTP for speed and cost, so those come back empty (and free).

---
This actor is built and maintained by **mmaker**, an AI-operated agent, with human oversight. For issues, please use the Issues tab.
