# Customer feedback into shep

Your support tool, a feedback widget or a small script can post customer feedback straight into
a space. Each piece lands as a **signal** (see [Opportunities](./opportunities.md)), and similar
signals group into **themes** you can turn into opportunities in one step.

## 1. Create a feedback key

A key belongs to one space, so work feedback never lands in a personal space.

```bash
shep feedback key create --space acme --name Zendesk
```

Shep prints the key once (`shep_fb_…`). Copy it into the tool now: shep keeps only a hash and
the first characters. On the Opportunities page, **Feedback keys** creates keys the same way.
`shep feedback key ls` lists them; `shep feedback key revoke <key>` cuts a tool off.

## 2. Post feedback

```bash
curl -X POST https://<your shep host>/api/feedback \
  -H "Authorization: Bearer shep_fb_…" \
  -H "Content-Type: application/json" \
  -d '{
        "text": "Guest checkout times out\nHappens on mobile since Tuesday.",
        "customer": "Globex",
        "monthlyRevenue": 4000,
        "url": "https://support.acme.com/tickets/812",
        "urgent": true,
        "externalId": "zendesk-812"
      }'
```

| Field | Required | Meaning |
| ----- | -------- | ------- |
| `text` | yes | The feedback; its first line becomes the signal's title, the rest its detail |
| `detail` | no | More text, added after the rest of `text` |
| `customer` | no | The customer or account |
| `monthlyRevenue` | no | Revenue at stake per month for that customer, 0 or more |
| `url` | no | An http(s) link back to the original |
| `urgent` | no | `true` when it needs attention soon |
| `externalId` | no | Your tool's id for it; posting the same id again returns the signal already recorded |

Answers: **201** recorded, **200** already recorded (same `externalId`), **400** bad payload,
**401** unknown or revoked key, **413** body over 16 KB. The answer is `{ "id": "<signal id>",
"duplicate": false }`.

The shep web server listens on your machine. For a hosted tool to reach it, expose it with
`shep start` and your tunnel, or post from a script on the same machine.

## 3. Themes

```bash
shep feedback themes --space acme
```

Unlinked signals that share enough words form a theme, labelled by its most common words, with
the customers, revenue and urgent signals behind it. The Opportunities page shows themes above
the unlinked signals.

## 4. Promote a theme

```bash
shep feedback promote <theme> --hours 6 --title "Faster guest checkout"
```

Shep creates a proposed opportunity (titled by the theme's words unless you give a title) and
links every signal of the theme to it. It is ranked with the others by value per review hour.

## Good to know

- Feedback keys are bearer secrets: anyone holding one can post into that space. Revoke a key
  the moment a tool no longer needs it.
- Themes are computed from words, not meaning; two requests phrased very differently stay apart.
