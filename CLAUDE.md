# Domain Seller Engine - Claude Instructions

## Start Here First

- Read `docs/agent-handoff.md` before making changes or trusting local dev state.
- Treat `docs/agent-handoff.md` as the shared source of truth with Codex.
- If you change ports, startup assumptions, routing, UI direction, or discover a workaround/blocker, update `docs/agent-handoff.md` in the same session.

## Local Dev Rule

- Default startup command is `pnpm dev:up`.
- Do not trust `localhost:5173` or the worker port just because the port is open.
- Before verifying UI or API behavior, confirm the owning process command line points at:
  - `C:\Users\FD111\Documents\Domain Seller Engine`
- If the process points at `.claude/worktrees/...` or another workspace, treat it as stale/invalid and restart with `pnpm dev:up`.
- Current local standard:
  - frontend on `5173`
  - worker on `8787`
  - Vite proxy on `5173` forwards `/api` to `8787`

## Skill Routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming -> invoke office-hours
- Bugs, errors, "why is this broken", 500 errors -> invoke investigate
- Ship, deploy, push, create PR -> invoke ship
- QA, test the site, find bugs -> invoke qa
- Code review, check my diff -> invoke review
- Update docs after shipping -> invoke document-release
- Weekly retro -> invoke retro
- Design system, brand -> invoke design-consultation
- Visual audit, design polish -> invoke design-review
- Architecture review -> invoke plan-eng-review
- Save progress, checkpoint, resume -> invoke checkpoint
- Code quality, health check -> invoke health
