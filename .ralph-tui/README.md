# Ralph TUI Configuration for FrostGuard

This directory contains the Ralph TUI configuration for automating code review and deployment preparation tasks for the FrostGuard (FreshTrack Pro) project.

## Quick Start

```bash
# Install Ralph TUI (if not already installed)
bun install -g ralph-tui

# Run setup wizard (optional - creates config interactively)
ralph-tui setup

# Run with JSON tracker (RECOMMENDED)
ralph-tui run --prd .ralph-tui/prd.json

# Check status
ralph-tui status
```

## Directory Structure

```
.ralph-tui/
├── config.toml                           # Main configuration
├── prd.json                              # Task tracker (11 user stories)
├── progress.md                           # Cross-iteration progress tracking
├── iterations/                           # Iteration logs (auto-created)
├── templates/
│   └── frostguard-review-deploy.hbs      # Custom prompt template
├── skills/                               # Project-specific skills
└── README.md                             # This file
```

## Configuration Overview

### config.toml Key Settings

```toml
# Agent: Claude Code with subagent tracing
agent = "claude"

[agentOptions]
model = "claude-sonnet-4-20250514"

# Tracker: JSON file-based (no external dependencies)
tracker = "json"

[trackerOptions]
prdFile = ".ralph-tui/prd.json"

# Progress tracking for cross-iteration context
progressFile = ".ralph-tui/progress.md"
```

### prd.json Format

The task file follows the Ralph PRD format:

```json
{
  "project": "FrostGuard",
  "branchName": "feature/deployment-readiness",
  "description": "...",
  "userStories": [
    {
      "id": "US-001",
      "title": "Task Title",
      "description": "As a [user], I want [capability] so that [benefit]...",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "priority": 1,
      "passes": false,
      "notes": "Additional context"
    }
  ]
}
```

## Task List (11 User Stories)

### Code Review (US-001 to US-005)

| ID | Title | Priority |
|----|-------|----------|
| US-001 | Security Audit - Authentication & Authorization | 1 (Critical) |
| US-002 | Security Audit - Input Validation & API Security | 2 |
| US-003 | Code Quality - Linting & Type Safety | 3 |
| US-004 | Test Coverage - Frontend & Backend | 4 |
| US-005 | Database Review - Schema & Migrations | 5 |

### Deployment Preparation (US-006 to US-011)

| ID | Title | Priority |
|----|-------|----------|
| US-006 | Environment Configuration - Production Setup | 6 |
| US-007 | Docker Build - Production Images | 7 |
| US-008 | Reverse Proxy - Caddy Configuration | 8 |
| US-009 | Monitoring Stack - Prometheus & Grafana | 9 |
| US-010 | Documentation - Deployment Guide Validation | 10 |
| US-011 | Final Validation - Deployment Dry Run | 11 (Final) |

## Cross-Iteration Progress Tracking

The `progress.md` file maintains context across iterations:

- **Codebase Patterns:** Architecture decisions, code style conventions
- **Recent Progress:** Work completed in previous iterations
- **Learnings & Blockers:** Issues encountered and solutions

Template variables injected from progress:
- `{{recentProgress}}` - Recent work summary
- `{{codebasePatterns}}` - Discovered patterns

## Custom Prompt Template

The template at `templates/frostguard-review-deploy.hbs` includes:

- Project context (tech stack, structure)
- Code review guidelines (security, quality, testing)
- Deployment strategy (self-hosted VM / DigitalOcean VPS)
- Quality gates and acceptance criteria
- Progress tracking instructions

## Running Ralph TUI

### Basic Commands

```bash
# Start autonomous loop with JSON tracker
ralph-tui run --prd .ralph-tui/prd.json

# Resume previous session
ralph-tui resume

# Check current status
ralph-tui status

# View iteration logs
ralph-tui logs
```

### Keyboard Controls

**Execution:** `s` (start), `p` (pause), `q` (quit)
**Navigation:** `j`/`k` (up/down), `Tab` (switch panels)
**Views:** `d` (dashboard), `T` (subagent tree)

## Deployment Target

Tasks prepare the project for deployment on:

| Environment | Specs | Cost |
|-------------|-------|------|
| Self-Hosted VM | 4 vCPU, 8GB RAM, 100GB SSD | Varies |
| DigitalOcean | s-4vcpu-8gb droplet | ~$48/month |

**OS:** Ubuntu 22.04 LTS recommended

## Completion Detection

Ralph detects task completion when the agent outputs:

```
<promise>COMPLETE</promise>
```

This signals Ralph to mark the current story as `passes: true` and proceed to the next task.

## Alternative: Beads Tracker

If you prefer git-backed task tracking with dependencies:

```bash
# Install Beads CLI
bun install -g beads

# Create an epic
bd create --title "FrostGuard Deployment" --type epic
# Returns: beads-xyz

# Create tasks under the epic
bd create --title "Security Audit" --type task --parent beads-xyz

# Run Ralph with Beads
ralph-tui run --epic beads-xyz
```

## Resources

- [Ralph TUI Documentation](https://ralph-tui.com/docs/)
- [Quick Start Guide](https://ralph-tui.com/docs/getting-started/quick-start)
- [Configuration Reference](https://ralph-tui.com/docs/configuration/overview)
- [Handlebars Templates](https://ralph-tui.com/docs/templates/handlebars)
- [FrostGuard Deployment Guide](../docs/PRODUCTION_DEPLOYMENT.md)
