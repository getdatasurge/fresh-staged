# Ralph TUI Configuration for FrostGuard

This directory contains the Ralph TUI configuration for automating code review and deployment preparation tasks for the FrostGuard (FreshTrack Pro) project.

## Overview

Ralph TUI is an AI Agent Loop Orchestrator that connects your AI coding assistant (Claude Code) to a task tracker and runs them in an autonomous loop, completing tasks one-by-one with intelligent selection, error handling, and full visibility.

## Directory Structure

```
.ralph-tui/
├── config.toml                           # Main configuration
├── prd.json                              # Task tracker (PRD format)
├── progress.md                           # Cross-iteration progress tracking
├── templates/
│   └── frostguard-review-deploy.hbs      # Custom prompt template
├── skills/                               # Project-specific skills
└── README.md                             # This file
```

## Getting Started

### Prerequisites

1. Install Ralph TUI:
   ```bash
   npm install -g ralph-tui
   # or
   npx ralph-tui
   ```

2. Ensure Claude Code CLI is installed:
   ```bash
   claude --version
   ```

### Running Tasks

1. **Start the TUI:**
   ```bash
   ralph-tui run
   ```

2. **Resume a previous session:**
   ```bash
   ralph-tui resume
   ```

3. **Check status:**
   ```bash
   ralph-tui status
   ```

## Custom Prompt Template

The custom template at `templates/frostguard-review-deploy.hbs` is designed for:

- **Code Review Tasks:** Security audits, code quality checks, test coverage
- **Deployment Preparation:** Environment config, Docker builds, monitoring setup
- **Self-Hosted/DigitalOcean VPS:** Complete deployment strategy

### Template Variables Used

| Variable | Description |
|----------|-------------|
| `{{taskId}}` | Unique task identifier (e.g., "REVIEW-001") |
| `{{taskTitle}}` | Task summary |
| `{{taskDescription}}` | Full task description |
| `{{acceptanceCriteria}}` | Checklist of requirements |
| `{{recentProgress}}` | Progress from previous iterations |
| `{{codebasePatterns}}` | Discovered patterns and learnings |
| `{{prdCompletedCount}}` | Completed tasks count |
| `{{prdTotalCount}}` | Total tasks count |
| `{{currentDate}}` | Current date (ISO format) |

### Cross-Iteration Progress Tracking

The `progress.md` file maintains context across task iterations:

- **Codebase Patterns:** Architecture decisions, code style, deployment patterns
- **Recent Progress:** Work completed in previous iterations
- **Learnings & Blockers:** Issues encountered and solutions

This enables the AI agent to:
- Avoid repeating mistakes
- Build on previous work
- Maintain consistency across tasks

## Task List (prd.json)

The task file contains 11 structured tasks:

### Code Review Tasks
| ID | Title | Priority |
|----|-------|----------|
| REVIEW-001 | Security Audit - Authentication & Authorization | Critical |
| REVIEW-002 | Security Audit - Input Validation & API Security | Critical |
| REVIEW-003 | Code Quality - Linting & Type Safety | High |
| REVIEW-004 | Test Coverage - Frontend & Backend | High |
| REVIEW-005 | Database Review - Schema & Migrations | High |

### Deployment Tasks
| ID | Title | Priority |
|----|-------|----------|
| DEPLOY-001 | Environment Configuration - Production Setup | High |
| DEPLOY-002 | Docker Build - Production Images | High |
| DEPLOY-003 | Reverse Proxy - Caddy Configuration | Medium |
| DEPLOY-004 | Monitoring Stack - Prometheus & Grafana | Medium |
| DEPLOY-005 | Documentation - Deployment Guide Validation | Medium |
| DEPLOY-006 | Final Validation - Deployment Dry Run | Critical |

## Deployment Target

The tasks prepare the project for deployment on:

- **Self-Hosted VM** (any Linux VPS)
- **DigitalOcean Droplet** (recommended: s-4vcpu-8gb, ~$48/month)

### Server Requirements

| Resource | Minimum |
|----------|---------|
| CPU | 4 vCPU |
| RAM | 8 GB |
| Storage | 100 GB SSD |
| OS | Ubuntu 22.04 LTS |

## Skills Available

The following skills can be used during task execution:

- `/ralph-tui-prd` - Create or update PRD documents
- `/ralph-tui-create-json` - Generate JSON task files
- `/ralph-tui-create-beads` - Create beads tracker entries

## Configuration Options

Key settings in `config.toml`:

```toml
# Agent
agent = "claude"
model = "claude-sonnet-4-20250514"

# Task Tracker
tracker = "json"

# Progress Tracking
[progress]
enabled = true
file = ".ralph-tui/progress.md"

# Quality Gates
[quality]
require_tests = true
require_lint = true
require_typecheck = true
```

## Completion Signal

When all acceptance criteria are met, the agent signals completion with:

```
<promise>COMPLETE</promise>
```

This triggers Ralph TUI to proceed to the next task automatically.

## Resources

- [Ralph TUI Documentation](https://ralph-tui.com/docs/)
- [Handlebars Reference](https://ralph-tui.com/docs/templates/handlebars)
- [FrostGuard Deployment Guide](../docs/PRODUCTION_DEPLOYMENT.md)
