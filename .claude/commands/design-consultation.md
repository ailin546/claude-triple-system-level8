# Design Consultation

Multi-perspective design consultation before UI implementation. Gathers recommendations
from UI Designer, UX Architect, and UX Researcher agents in parallel.

## Usage

- `/design-consultation` — Full consultation for the current task
- `/design-consultation <description>` — Consultation for a specific UI task

## Process

1. Read the skill at `.claude/skills/design-consultation/SKILL.md`
2. Execute the 5-step workflow defined there:
   - **Step 1**: Gather context (existing design tokens, tech stack, target devices)
   - **Step 2**: Launch 3 parallel design agents (`design-ui-designer`, `design-ux-architect`, `design-ux-researcher`)
   - **Step 3**: Run accessibility gate (WCAG AA checklist)
   - **Step 4**: Synthesize into unified design brief
   - **Step 5**: Present to user and wait for confirmation

## Agent Dispatch

Launch these agents in parallel with the task context:

```
Agent 1 (design-ui-designer):
  "Review this UI task and recommend: color palette, typography, spacing,
   component patterns, dark mode support. Task: $ARGUMENTS"

Agent 2 (design-ux-architect):
  "Review this UI task and recommend: layout strategy, responsive breakpoints,
   information hierarchy, CSS architecture. Task: $ARGUMENTS"

Agent 3 (design-ux-researcher):
  "Review this UI task from a user perspective: user needs, cognitive load,
   usability patterns, task completion flow. Task: $ARGUMENTS"
```

## Output

Produce a **Design Consultation Report** with sections for each perspective,
accessibility requirements, proposed design tokens, and implementation priority.

Wait for user approval before proceeding to implementation.
