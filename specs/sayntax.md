# Sayntax — Spec

> **"Just say it."** A programming language you can speak, with Meta AI as its front door.

- **Event:** Meta Global AI Developer Hackathon (Cerebral Valley), Indie Developer track, theme *Build for Your World*
- **Deadline:** Nov 4, 2026, 9:00 PM ET (we aim to submit by 12:00 PM ET)
- **Repo:** https://github.com/able03/meta-ai-global-dev (public, MIT)
- **Team:** solo

---

## 1. Problem (the pitch)

In my first programming class I watched classmates give up. They could think logically, but syntax was overwhelming and nobody could explain it. I pushed through because I was curious. Most of them didn't.

**First-time coders quit at the syntax wall.** Sayntax lets them write logic in their own words, see it as short tidy steps, run it instantly, and slowly learn real Python syntax without noticing.

### Why it's not "just prompting an AI" (and not a generic education chatbot)
| Chatbot | Sayntax |
|---|---|
| Returns 60–80 lines of code a beginner can't read | Returns 3 short readable Steps |
| Copy, paste, install, fix errors | Runs instantly in the browser |
| Re-prompting rewrites everything | Edit one step |
| Different output every time | A fixed, small language, so results are predictable |
| The AI does the thinking | The beginner owns the logic, and the AI only tidies it |

**Positioning rule:** never use "chatbot" or "tutor" in the app, README or video.

---

## 2. Core concept

```
My words (messy, any language, typed or spoken)
      │  Muse Spark (the only AI step, ~$0.005)
      ▼
Steps  = Sayntax source code (.say)  ◄── beginners can also type this directly (free, own parser)
      │  own interpreter (free)
      ▼
Stage runs the program        +   Code view: Python generated deterministically (free)
```

- **Three views** (toggle): 📝 My words · ✨ **Steps (default)** · 🐍 Code (Python)
- **Highlighting:** click a sentence to light up its steps and Python lines. Hover a line for a one-line plain-English explanation.
- **Guess first:** vague input is not interrogated. Muse makes its best guess and marks assumptions (color, speed) as editable.
- **Never add unrequested features.**
- **Edits:** keep chatting ("make it faster", "add a score"). The current Steps and the instruction go to Muse, which returns updated Steps. Users can also edit Steps by hand.
- **Syntax sneaks in:** typing Steps directly is faster and free, so learners naturally pick up the standard form. *"The AI is training wheels."*

---

## 3. The Sayntax language (v1)

### Runtime model
- One **stage** (~800×500 canvas) with **characters** (shapes/emoji; Muse Image sprites as a stretch goal) plus a **text area** for `say`/`ask`.

### Grouping and forgiveness
- `:` + indentation, like Python. Any amount of spaces or tabs is accepted.
- A single short action may sit on the same line: `when left key is pressed: move basket left 10`
- The parser ignores case, "the", "a"/"an" and plurals, and accepts synonyms (`touches` = `hits` = `collides with`, `left arrow` = `left key`).
- Muse's output always uses the **one standard form**.

### Blocks (~18)
| Group | Blocks |
|---|---|
| Things | `X is a <color> <shape/emoji> [at …] [size …]` · `make a X` · `remove X` · `hide X` / `show X` |
| Motion | `move X <direction> <n>` · `X falls <n>` · `X goes to <place>` · `X bounces` |
| Variables | `score is 0` · `add 1 to score` · `random 1 to 10` |
| Text | `say "…"` (with `{var}`) · `ask "…" into name` |
| Control | `forever:` · `repeat N times:` · `if …:` / `otherwise:` · `every N second(s):` · `wait N second(s)` · `stop` |
| Events | `when <key> key is pressed:` · `when X touches Y:` · `when X hits edge:` |

### Example — `catch-the-stars.say`
```say
basket is a 🧺 at bottom center
score is 0

every 1 second:
    make a ⭐ at random x, top
    the ⭐ falls 3

when left key is pressed: move basket left 10
when right key is pressed: move basket right 10

when basket touches ⭐:
    add 1 to score
    remove that ⭐
    say "Score: {score}"
```

### Showcase programs (shipped in `examples/`)
1. `bouncing-ball.say`: messy words become 3 steps, then it runs
2. `guess-the-number.say`: ask, if, variables, loops
3. `catch-the-stars.say`: keys, collisions, score, plus a live chat edit

### Errors
- **Bad Muse output:** check it against the grammar, retry once with the error, then show "I didn't get that — try saying it another way."
- **Beginner typos:** kind, specific hints from our own parser, e.g. *"Line 3: I don't know 'bouce' — did you mean `bounce`?"*

---

## 4. Meta AI usage (runtime AI is Muse only)
| Model | Use | Priority |
|---|---|---|
| **Muse Spark** (Meta Model API) | My words → Steps, chat edits | Core |
| **Muse Voice Transcribe** | 🎤 speak your program | Stretch #1 (day 6) |
| **Muse Spark Open** via Baseten (`meta-models/muse-spark-open-1026`) | Translation backend, switchable by one setting; run against the golden set; aim for the open-weight bonus | Stretch (day 7) |
| **Muse Image** | Character sprites, cached, falling back to shapes | Stretch |

- Other AIs (e.g. Claude) are used **only for development**, never at runtime.
- Post-hackathon roadmap: a distilled or fine-tuned small open-weight Muse model running offline, so schools need no API key.

---

## 5. Architecture
- **Frontend:** Vite + React + TypeScript. Canvas stage. Parser, interpreter and Python generator run in the browser.
- **Backend:** Vercel serverless functions
  - `POST /api/translate`: (access code, words or current Steps + instruction) → validated Steps
  - `POST /api/transcribe`: audio → text (stretch)
  - `POST /api/check-code`
- **Model provider switch:** an environment variable selects the Muse Spark API or Muse Spark Open on Baseten.
- **Persistence:** no login. Autosave to localStorage. Download and open `.say` files. Share link as a stretch goal.
- **Hosting:** Vercel, with a live link given to judges.

### Access codes and credit safety
- Codes lock **only the AI features**. Anyone can open the app, run examples and type Steps.
- Several codes (`judges`, `me`, `testers`) are stored in server environment variables, each with its own daily AI limit, and each can be switched off.
- **Global spend cap** (e.g. stop at $100), enforced on the server. Billing beyond credits is charged and "spend limit" notices don't stop it, so this cap is mandatory.
- The API key lives only on the server; `.env` is in `.gitignore`.
- Budget: $150 Meta credits at ~$0.005 per translation, about 28k calls. Expected use is 1–2k.

---

## 6. Testing
- **Vitest** unit tests for the parser, interpreter and Python generator.
- **Golden set:** ~30 messy sentences with expected Steps, run against Muse whenever the prompt changes (~$0.15 per run). Also used to compare Muse Spark with Muse Spark Open.

---

## 7. Build plan
| Day | Date | Work | Milestone |
|---|---|---|---|
| 1 | Mon Oct 27 | Repo setup (Vite + React + TS, MIT, README), first Muse API call, start the parser | Muse key works |
| 2 | Tue Oct 28 | Full parser, forgiving input, friendly errors, tests | 3 examples parse |
| 3 | Wed Oct 29 | Interpreter + stage | **Language works with zero AI** |
| 4 | Thu Oct 30 | `/api/translate` (prompt, validate + retry, assumptions), model switch, access codes, limits, cap | Words → running program |
| 5 | Fri Oct 31 | Three views, chat edits, Python generator | Full core loop |
| 6 | Sat Nov 1 | Highlighting, hover explanations, autosave, `.say` files, **deploy**, 🎤 voice | **Core feature freeze** |
| 7 | Sun Nov 2 | Muse Spark Open test, sprites, multi-language check, share link, friend testing | Feedback |
| 8 | Mon Nov 3 | Fixes, polish, README, **record video** | Video done |
| 9 | Tue Nov 4 | Buffer, **submit by noon ET**, post on X | Submitted |

---

## 8. Submission checklist
- [ ] **3-minute video:** story (15 s) → bouncing ball → guess the number → catch the stars + live edit → spoken input → "works in Hindi too" → *"Sayntax. Just say it."*
- [ ] Public repo: MIT, README with setup, `examples/*.say`, roadmap section, built entirely during the hackathon
- [ ] Live Vercel link plus the judges' access code in the submission notes
- [ ] Every contributor's name
- [ ] Submitted via the CV submission platform before **Nov 4, 9 PM ET** (target: noon)
- [ ] 30–60 s demo cut posted on X; link submitted for Most Viral (engagement counts through Nov 8)

## 9. Admin to-dos (today)
- [ ] Claim $150 Meta credits (claim form via @CV), add a card, check the **Billing** page
- [ ] Apply for Baseten credits (limited to 2,000 participants)
- [ ] Ask @CV to confirm Sayntax is outside the "generic education chatbot" category
- [ ] Optional: Agents 101/102 (Oct 27/28) and Fireworks session (Oct 30), noon–1 PM ET

## 10. Out of scope (v1)
Login/accounts · C++/Java views · "Graduate" mode for editing Python directly (stretch only if time allows) · installable/CLI version · fine-tuning · anything beyond the ~18 blocks
