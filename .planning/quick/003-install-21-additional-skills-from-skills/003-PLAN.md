---
phase: quick-003
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .skills/subsy/ralph-tui/*
  - .skills/wshobson/agents/*
  - .skills/cloudai-x/threejs-skills/*
  - .skills/github/awesome-copilot/*
  - .skills/sickn33/antigravity-awesome-skills/*
  - .skills/existential-birds/beagle/*
  - .skills/tencentcloudbase/skills/*
  - .skills/webflow/webflow-skills/*
  - .skills/shpigford/skills/*
  - .skills/davila7/claude-code-templates/*
  - .skills/composiohq/awesome-claude-skills/*
autonomous: true

must_haves:
  truths:
    - '21 additional skills installed and available in .skills directory'
    - 'Skills organized by vendor/repo structure'
    - 'Existing stripe/ai and wshobson/agents skills preserved'
  artifacts:
    - path: '.skills/subsy/ralph-tui'
      provides: 'ralph-tui-create-beads, ralph-tui-create-json, ralph-tui-prd'
    - path: '.skills/cloudai-x/threejs-skills'
      provides: '6 Three.js skills'
    - path: '.skills/davila7/claude-code-templates'
      provides: 'senior-backend, senior-frontend'
  key_links: []
---

<objective>
Install 21 additional Claude Code skills from skills.sh by cloning repositories and copying skill directories.

Purpose: Expand available skills for code generation, UI design, Three.js development, and specialized frameworks.
Output: 21 new skills installed in .skills/ directory, organized by vendor/repo structure.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Skills installation uses git clone + directory copy approach (npx skills add has TTY issues in non-interactive mode).
Existing .skills/ structure: stripe/ai, wshobson/agents already installed.
All repos are public GitHub repos under github.com/skills-sh/{repo} format.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Clone skill repositories to temp directory</name>
  <files>/tmp/skills-repos/*</files>
  <action>
Create temp directory and clone all 11 unique repositories:

```bash
mkdir -p /tmp/skills-repos && cd /tmp/skills-repos

# Clone all repos (parallel where possible)
git clone --depth 1 https://github.com/skills-sh/subsy-ralph-tui.git &
git clone --depth 1 https://github.com/skills-sh/wshobson-agents.git &
git clone --depth 1 https://github.com/skills-sh/cloudai-x-threejs-skills.git &
git clone --depth 1 https://github.com/skills-sh/github-awesome-copilot.git &
git clone --depth 1 https://github.com/skills-sh/sickn33-antigravity-awesome-skills.git &
git clone --depth 1 https://github.com/skills-sh/existential-birds-beagle.git &
git clone --depth 1 https://github.com/skills-sh/tencentcloudbase-skills.git &
git clone --depth 1 https://github.com/skills-sh/webflow-webflow-skills.git &
git clone --depth 1 https://github.com/skills-sh/shpigford-skills.git &
git clone --depth 1 https://github.com/skills-sh/davila7-claude-code-templates.git &
git clone --depth 1 https://github.com/skills-sh/composiohq-awesome-claude-skills.git &
wait
```

Use --depth 1 for shallow clones to minimize download time.
</action>
<verify>All 11 directories exist in /tmp/skills-repos/</verify>
<done>All skill repositories cloned successfully</done>
</task>

<task type="auto">
  <name>Task 2: Copy skill directories to .skills/</name>
  <files>.skills/*/</files>
  <action>
Copy specific skill directories from cloned repos to .skills/ with vendor organization:

```bash
cd /home/skynet/freshtrack-pro-local/fresh-staged

# 1. subsy/ralph-tui (3 skills)
mkdir -p .skills/subsy
cp -r /tmp/skills-repos/subsy-ralph-tui .skills/subsy/ralph-tui

# 2. wshobson/agents - ADD to existing (2 more skills)
# Already has agents dir, copy any missing skill subdirs
cp -rn /tmp/skills-repos/wshobson-agents/* .skills/wshobson/agents/ 2>/dev/null || true

# 3. cloudai-x/threejs-skills (6 skills)
mkdir -p .skills/cloudai-x
cp -r /tmp/skills-repos/cloudai-x-threejs-skills .skills/cloudai-x/threejs-skills

# 4. github/awesome-copilot (1 skill: refactor)
mkdir -p .skills/github
cp -r /tmp/skills-repos/github-awesome-copilot .skills/github/awesome-copilot

# 5. sickn33/antigravity-awesome-skills (2 skills)
mkdir -p .skills/sickn33
cp -r /tmp/skills-repos/sickn33-antigravity-awesome-skills .skills/sickn33/antigravity-awesome-skills

# 6. existential-birds/beagle (1 skill: shadcn-ui)
mkdir -p .skills/existential-birds
cp -r /tmp/skills-repos/existential-birds-beagle .skills/existential-birds/beagle

# 7. tencentcloudbase/skills (1 skill: ui-design)
mkdir -p .skills/tencentcloudbase
cp -r /tmp/skills-repos/tencentcloudbase-skills .skills/tencentcloudbase/skills

# 8. webflow/webflow-skills (1 skill: site-audit)
mkdir -p .skills/webflow
cp -r /tmp/skills-repos/webflow-webflow-skills .skills/webflow/webflow-skills

# 9. shpigford/skills (1 skill: screenshots)
mkdir -p .skills/shpigford
cp -r /tmp/skills-repos/shpigford-skills .skills/shpigford/skills

# 10. davila7/claude-code-templates (2 skills)
mkdir -p .skills/davila7
cp -r /tmp/skills-repos/davila7-claude-code-templates .skills/davila7/claude-code-templates

# 11. composiohq/awesome-claude-skills (1 skill)
mkdir -p .skills/composiohq
cp -r /tmp/skills-repos/composiohq-awesome-claude-skills .skills/composiohq/awesome-claude-skills
```

Remove .git directories from copied skills:

```bash
find .skills -name ".git" -type d -exec rm -rf {} + 2>/dev/null || true
```

  </action>
  <verify>ls -la .skills/ shows all vendor directories; find .skills -name "*.md" | wc -l shows skill files present</verify>
  <done>All 21 skills copied to .skills/ with proper vendor organization</done>
</task>

<task type="auto">
  <name>Task 3: Create vendor CLAUDE.md index files and cleanup</name>
  <files>.skills/*/CLAUDE.md</files>
  <action>
Create CLAUDE.md index files for each new vendor directory (like existing stripe/ and wshobson/ have):

For each new vendor (subsy, cloudai-x, github, sickn33, existential-birds, tencentcloudbase, webflow, shpigford, davila7, composiohq):

```markdown
# {vendor} Skills

Skills from {vendor} repository.

See subdirectories for individual skill documentation.
```

Clean up temp directory:

```bash
rm -rf /tmp/skills-repos
```

Verify final structure:

```bash
ls -la .skills/
find .skills -maxdepth 3 -type d | head -50
```

  </action>
  <verify>Each vendor directory has CLAUDE.md; temp directory removed; .skills/ contains 12 vendor directories total</verify>
  <done>Vendor index files created, temp files cleaned up, skills installation complete</done>
</task>

</tasks>

<verification>
- Run: `ls .skills/` shows 12 vendor directories (stripe, wshobson, subsy, cloudai-x, github, sickn33, existential-birds, tencentcloudbase, webflow, shpigford, davila7, composiohq)
- Run: `find .skills -name "CLAUDE.md" | wc -l` shows index files present
- Run: `du -sh .skills/` shows reasonable size (skills should be lightweight)
- Existing stripe/ai and wshobson/agents skills still present
</verification>

<success_criteria>

- 21 new skills installed across 11 repositories
- Skills organized by vendor/repo structure
- Existing skills preserved (stripe/ai, wshobson/agents)
- No .git directories in .skills/
- Each vendor has CLAUDE.md index file
  </success_criteria>

<output>
After completion, create `.planning/quick/003-install-21-additional-skills-from-skills/003-SUMMARY.md`
</output>
