<div align="center">

# 🏦 Finnova Hackathon 2026

### 12 hours. One team. Responsible AI for Banking & Finance.

Part of **[Swiss {ai} Weeks 2026](https://ai-weeks.ch/)** — Switzerland's largest open AI movement.

<br/>

[![Event](https://img.shields.io/badge/Event-Finnova_Hackathon-E4002B?style=for-the-badge)](https://ai-weeks.ch/events/finnova-hackathon)
[![Date](https://img.shields.io/badge/Fri_18_Sep_2026-12_hours-1F2937?style=for-the-badge)](https://luma.com/kd5177ia)
[![Location](https://img.shields.io/badge/Lenzburg-Finnova_HQ-0EA5E9?style=for-the-badge)](https://www.finnova.com/)
[![Swiss ai Weeks](https://img.shields.io/badge/Swiss_%7Bai%7D_Weeks-1_Sep_→_4_Oct-7C3AED?style=for-the-badge)](https://ai-weeks.ch/)

</div>

---

## 📍 The Event at a Glance

|  |  |
|---|---|
| **What** | Finnova Hackathon — a 12-hour AI build sprint |
| **When** | **Friday, 18 September 2026** |
| **Where** | Finnova AG Bankware HQ, Lenzburg 🇨🇭 |
| **Umbrella** | [Swiss {ai} Weeks 2026](https://ai-weeks.ch/) (1 Sep – 4 Oct 2026) |
| **Tracks** | Banking & Finance challenges · Freestyle / Open Innovation |

> ⚠️ Times, room assignments and the final agenda are published on the official pages — always treat those as the source of truth.

---

## 🔗 Official Resources

> These are the four links the team is working from. Bookmark all of them before Friday.

### 🎪 [Event Page — AI Weeks](https://ai-weeks.ch/events/finnova-hackathon)
The official Finnova Hackathon listing on the Swiss {ai} Weeks site. Agenda, venue, timing and registration.

### 🎯 [Challenges — Notion](https://swamp-shake-7d9.notion.site/Challenges-247ac535de758095b85dea6ede1adaaa)
The challenge catalogue from partner organisations. **Read this first** — pick a challenge before the day starts so we don't burn the first hour deciding.

### 🧰 [Tools — Notion](https://swamp-shake-7d9.notion.site/Tools-26aac535de7580b689e6edc66e16a4a0)
The toolbox available to participants: sponsored accounts, API access, credits and platforms. Check what's provided *before* paying for anything.

### 🎬 [Synthesia](https://www.synthesia.io)
AI video generation with avatars and voiceovers — turn a script into a presenter-led video in minutes. Strong candidate for the **final pitch video** or a polished demo walkthrough when we can't film a live one.

---

### Rules of thumb
- 🎯 **Demo > architecture.** Judges see the demo, not the repo.
- ✂️ **Scope down, then scope down again.** 12 hours is less than it sounds.
- 🤝 **Responsible AI is a judging lens, not a footnote** — be ready to speak to data, bias and human oversight.

---

## 🚀 Getting Started

```bash
git clone https://github.com/elm1nst3r/FinnovaHackathon2026.git
cd FinnovaHackathon2026
```

### Running the prototype

Requires **Node 24+** — the code is TypeScript and Node runs it directly, so
there is no build step for the service or the tests.

```bash
npm install
npm run build:web     # bundles the cockpit into public/ and the extension into dist/extension/
npm run serve         # policy service + cockpit on http://127.0.0.1:8787
```

Open <http://127.0.0.1:8787/>. Identity is mocked: use the **demo identity**
picker in the header to switch persona.

| Persona | Sees |
|---|---|
| **Anna Berger** | Employee view only |
| **Luca Moretti** | Employee view only |
| **Sara Keller** | Employee **and** governance view (`ai-governance` group) |

Switching persona is not a privilege escalation trick — the server re-derives
group membership on every request, so an employee calling a governance
endpoint directly is still refused.

### Loading the browser extension

The enforcement point is a Chrome MV3 extension. It is what actually sees a
prompt; the cockpit never does.

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select `dist/extension/`
3. Open ChatGPT, Copilot or Gemini and type something with an IBAN or a name in it

The extension talks to `http://127.0.0.1:8787`, so the service must be running
the first time. After that it works from its own cache — stop the service and
it keeps enforcing the last known good policy set, flagging the age once the
cache passes 24 hours.

```bash
npm run typecheck     # tsc --noEmit
npm test              # node --test
```

---

## �️ Repo Structure

```text
.
├── docs/
│   ├── prd/            # Product requirement documents  → see docs/prd/README.md
│   └── pitch/          # Slides, demo script, pitch video assets
├── openspec/           # Change specs driving the implementation
├── src/
│   ├── core/           # Decision engine, policy validation, exceptions — pure, no I/O
│   ├── service/        # Policy service: identity, store, HTTP routes
│   ├── cockpit/        # Two-view web cockpit (employee · governance)
│   ├── extension/      # Chrome MV3 enforcement point
│   └── fixtures/       # Seed data for the demo
├── test/               # node --test suites
├── .github/            # PR template
└── CONTRIBUTING.md     # Branching, commits, ground rules
```

### 📄 Concept

**[Finnova AI Guard](docs/prd/finnova-ai-guard-prd.md)** — an AI governance
enforcement layer. Employees keep using their preferred AI tools; every
interaction is automatically **ALLOWED**, **MADE SAFE** or **BLOCKED** against
Finnova policy before data leaves the browser.

> **Use AI where you want. Governance follows you.**

---

## �👥 Team

| Name | Role | GitHub |
|---|---|---|
| _add yourself_ | _e.g. Backend_ | _@handle_ |
| _add yourself_ | _e.g. Frontend_ | _@handle_ |
| _add yourself_ | _e.g. Pitch / Design_ | _@handle_ |

---

<div align="center">

**Let's build something worth demoing.** 🚀

<sub>Finnova Hackathon · Swiss {ai} Weeks 2026 · Lenzburg</sub>

</div>
