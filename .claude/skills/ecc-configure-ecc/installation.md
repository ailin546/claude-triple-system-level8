# ECC Installation (Steps 0-3)

## Step 0: Clone ECC Repository

Before any installation, clone the latest ECC source to `/tmp`:

```bash
rm -rf /tmp/everything-claude-code
git clone https://github.com/affaan-m/everything-claude-code.git /tmp/everything-claude-code
```

Set `ECC_ROOT=/tmp/everything-claude-code` as the source for all subsequent copy operations.

If the clone fails (network issues, etc.), use `AskUserQuestion` to ask the user to provide a local path to an existing ECC clone.

---

## Step 1: Choose Installation Level

Use `AskUserQuestion` to ask the user where to install:

```
Question: "Where should ECC components be installed?"
Options:
  - "User-level (~/.claude/)" — "Applies to all your Claude Code projects"
  - "Project-level (.claude/)" — "Applies only to the current project"
  - "Both" — "Common/shared items user-level, project-specific items project-level"
```

Store the choice as `INSTALL_LEVEL`. Set the target directory:
- User-level: `TARGET=~/.claude`
- Project-level: `TARGET=.claude` (relative to current project root)
- Both: `TARGET_USER=~/.claude`, `TARGET_PROJECT=.claude`

Create the target directories if they do not exist:
```bash
mkdir -p $TARGET/skills $TARGET/rules
```

---

## Step 2: Select & Install Skills

### 2a: Choose Scope (Core vs Niche)

Default to **Core (recommended for new users)** — copy `.agents/skills/*` plus `skills/search-first/` for research-first workflows. This bundle covers engineering, evals, verification, security, strategic compaction, frontend design, and Anthropic cross-functional skills (article-writing, content-engine, market-research, frontend-slides).

Use `AskUserQuestion` (single select):
```
Question: "Install core skills only, or include niche/framework packs?"
Options:
  - "Core only (recommended)" — "tdd, e2e, evals, verification, research-first, security, frontend patterns, compacting, cross-functional Anthropic skills"
  - "Core + selected niche" — "Add framework/domain-specific skills after core"
  - "Niche only" — "Skip core, install specific framework/domain skills"
Default: Core only
```

If the user chooses niche or core + niche, continue to Steps 2b-2c.

### 2b: Choose Skill Categories

There are 41 skills organized into 8 categories. Use `AskUserQuestion` with `multiSelect: true`:

```
Question: "Which skill categories do you want to install?"
Options:
  - "Framework & Language" — "Django, Spring Boot, Go, Python, Java, Frontend, Backend patterns"
  - "Database" — "PostgreSQL, ClickHouse, JPA/Hibernate patterns"
  - "Workflow & Quality" — "TDD, verification, learning, security review, compaction"
  - "Business & Content" — "Article writing, content engine, market research, investor materials, outreach"
  - "Research & APIs" — "Deep research, Exa search, Claude API patterns"
  - "Social & Content Distribution" — "X/Twitter API, crossposting alongside content-engine"
  - "Media Generation" — "fal.ai image/video/audio alongside VideoDB"
  - "Orchestration" — "dmux multi-agent workflows"
  - "All skills" — "Install every available skill"
```

### 2c: Confirm Individual Skills

For each selected category, read [skill-catalog.md](skill-catalog.md) to see the full list. Print the skills for each selected category and ask the user to confirm or deselect specific ones. If the list exceeds 4 items, print the list as text and use `AskUserQuestion` with an "Install all listed" option plus "Other" for the user to paste specific names.

### 2d: Execute Installation

For each selected skill, copy the entire skill directory:
```bash
cp -r $ECC_ROOT/skills/<skill-name> $TARGET/skills/
```

Note: `continuous-learning` and `continuous-learning-v2` have extra files (config.json, hooks, scripts) — ensure the entire directory is copied, not just SKILL.md.

---

## Step 3: Select & Install Rules

Use `AskUserQuestion` with `multiSelect: true`:

```
Question: "Which rule sets do you want to install?"
Options:
  - "Common rules (Recommended)" — "Language-agnostic principles: coding style, git workflow, testing, security, etc. (8 files)"
  - "TypeScript/JavaScript" — "TS/JS patterns, hooks, testing with Playwright (5 files)"
  - "Python" — "Python patterns, pytest, black/ruff formatting (5 files)"
  - "Go" — "Go patterns, table-driven tests, gofmt/staticcheck (5 files)"
```

Execute installation:
```bash
# Common rules (flat copy into rules/)
cp -r $ECC_ROOT/rules/common/* $TARGET/rules/

# Language-specific rules (flat copy into rules/)
cp -r $ECC_ROOT/rules/typescript/* $TARGET/rules/   # if selected
cp -r $ECC_ROOT/rules/python/* $TARGET/rules/        # if selected
cp -r $ECC_ROOT/rules/golang/* $TARGET/rules/        # if selected
```

**Important**: If the user selects any language-specific rules but NOT common rules, warn them:
> "Language-specific rules extend the common rules. Installing without common rules may result in incomplete coverage. Install common rules too?"
