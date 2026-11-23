# TestNova

AI-driven web application testing. Point TestNova at a web app and its AI Pipeline explores it,
writes user stories and a knowledge base, plans and runs tests in a real browser, generates
Playwright automation, heals failing tests, logs defects and writes the QA report. The dashboard
shows every module, execution, defect and report.

## What you need

| | Needed for |
|---|---|
| **Windows 10/11** | `start.bat` (on macOS/Linux, run the steps in it by hand) |
| **Git** | cloning the repo |
| **Node.js 22.12 or newer** | everything. `start.bat` offers to install it with winget if it is missing |
| **A Claude account** (Claude Code sign-in) or an Anthropic API key | the AI Pipeline only |
| **Google Chrome** | PDF reports |

## Quick start

```
git clone https://github.com/jayeshpagar28/TestNova.git
cd TestNova
start.bat
```

The first run installs the dependencies and Playwright's browsers (a few minutes), creates `.env`
from `.env.example`, and opens the dashboard at **http://localhost:5180**. Later runs skip the
installs and start in seconds. Press **Ctrl+C** in the window to stop TestNova.
`start.bat --reinstall` reinstalls all dependencies.

## Connect your Claude account

The AI Pipeline's agents run on Claude. Connect it once on the PC that runs TestNova:

1. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
2. Run `claude` in a terminal, sign in with your Claude account, then type `/exit`.

That's all: TestNova uses the same sign-in. No restart is needed.

Using an API key instead? Set `ANTHROPIC_API_KEY` in your environment, then start TestNova.

You will know if it is missing: `start.bat` prints **Claude account NOT connected**, and the AI
Pipeline page shows **Connect your Claude account** and will not start until it is connected.
Everything else (Setup, modules, test runs, reports, defects) works without Claude.

## First steps on the dashboard

1. **Setup**: create a project with the app's URL, environment, browsers, test logins and any
   knowledge sources (documents, links, notes).
2. **AI Pipeline**: choose a testing type (Full Coverage, UI, Functional or Security) and start.
   Turn on *Pause for my review* to check the outputs of stages 2, 3 and 4 before it goes on.
3. **Modules / Regression**: run the generated tests, see results and evidence, and download the
   PDF and Excel reports.

Each project lives in its own folder, `projects/<id>/`, with its logins, outputs, tests and run
history. That folder is never committed.

## Settings

| Variable | Default | |
|---|---|---|
| `TESTNOVA_WEB_PORT` | `5180` | dashboard page |
| `TESTNOVA_PORT` | `5181` | dashboard API |
| `TESTNOVA_NO_OPEN` | unset | `1`: `start.bat` does not open the browser |
| `TESTNOVA_SUPABASE` | on when configured | `off`: no Supabase mirroring |

Supabase (optional, for sign-in and sharing results) is configured in `.env`: see `.env.example`.

## Without start.bat

```
npm install
npm run dashboard:install
npm run browsers
copy .env.example .env
npm run dashboard
```

## Repository layout

| Path | |
|---|---|
| `dashboard/` | the dashboard: `server/` (API, pipeline, runner, reports), `web/` (React page), `reporter/`, `scripts/` |
| `.claude/agents/` | the eight pipeline stage agents |
| `prompts/` | the master prompt and the testing-type standards and rules |
| `scaffold/` | the Playwright Page Object Model framework copied into each new project |
| `supabase/` | database migrations |
| `projects/` | your projects (local only, not committed) |

More about the dashboard: [dashboard/README.md](dashboard/README.md).

## Troubleshooting

- **The AI Pipeline will not start: "Claude is not connected"**: see *Connect your Claude account*.
  If you are signed in and it still says so (an unusual setup), set `TESTNOVA_SKIP_CLAUDE_CHECK=1`
  and restart TestNova. On macOS the sign-in is kept in the Keychain and is not checked.
- **Port already in use**: another TestNova is running. Stop it, or set `TESTNOVA_WEB_PORT` and
  `TESTNOVA_PORT` to free ports.
- **Node.js too old**: install Node.js 22 LTS or newer from https://nodejs.org.
