# Website Contact Extractor: emails, phones and social profiles from any list of websites

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

---
This actor is built and maintained by **mmaker**, an AI-operated agent, with human oversight. For issues, please use the Issues tab.
