# CLAUDE.md

## Project Overview

> This project is a lightweight CRM and campaign operations platform designed for political and community organizations.  
> Priorities are reliability, operator speed, maintainability, and minimizing admin overhead.

There is an active rewrite of the backend codebase from Python to Rust. Please refer to the Rust rewrite plan for more information on the backend rewrite.
If you are working on a feature, do not propose changes to the python backend codebase, unless it is to fix a bug in production code that hasn't been migrated to Rust.
All new backend code should be written in Rust, unless there is a strong reason to use Python. If there is a strong reason to use Python, please make it clear why and get approval from the user first.

---

# Core Principles

## 1. Optimize for Maintainability

- Prefer simple systems over clever systems
- Reduce hidden complexity
- Minimize framework magic
- Keep dependencies lean
- Avoid premature abstraction

## 2. Preserve Operator Clarity

The human operator must always be able to:

- understand system state
- debug failures quickly
- override automation manually
- inspect data directly

Prefer transparency over elegance.

## 3. Minimize Cognitive Load

When designing features:

- reduce moving parts
- reduce configuration burden
- reduce required tribal knowledge
- reduce onboarding time

## 4. Bias Toward Incremental Delivery

Prefer:

- small deployable changes
- iterative improvements
- reversible decisions
- thin vertical slices

Avoid massive rewrites unless unavoidable.

---

# AI Agent Instructions

## General Behaviour

When working on this project:

- Think step-by-step
- Do not make assumptions about hidden architecture
- Read existing code before proposing major changes
- Match existing project conventions unless explicitly improving them
- Explain tradeoffs clearly
- Ask clarifying questions only when necessary
- Prefer actionable output over theoretical discussion

## Coding Expectations

Before writing code:

1. Identify the relevant files
2. Understand the current architecture
3. Check for existing utilities/helpers
4. Reuse patterns where sensible

When writing code:

- Write clear, readable code
- Prefer explicitness over cleverness
- Keep functions focused
- Avoid deep nesting
- Add comments only where they provide real value
- Do not over-engineer

After writing code:

- Review for edge cases
- Check naming consistency
- Check for dead code
- Verify error handling
- Consider operational impact

---

# Architecture Preferences

## Preferred Traits

- Stateless where possible
- Idempotent operations
- Clear boundaries
- Explicit data flow
- Composable modules
- Predictable behaviour

## Avoid

- Hidden side effects
- Excessive abstraction
- Tight coupling
- Magic auto-discovery systems
- Overly dynamic architectures
- Unnecessary microservices

---

# Decision Framework

When multiple approaches are possible, prioritize:

1. Reliability
2. Simplicity
3. Maintainability
4. Operational visibility
5. Performance
6. Developer convenience

---

# Documentation Standards

All major systems should include:

- Purpose
- Inputs/outputs
- Failure modes
- Operational considerations
- Deployment notes
- Recovery procedures

Prefer documentation that helps future maintainers make decisions.

---

# Error Handling Philosophy

Errors should:

- Fail loudly in development
- Fail safely in production
- Produce actionable logs
- Preserve debuggability

Avoid silently swallowing exceptions.

---

# Logging Standards

Logs should:

- Include contextual metadata
- Help reconstruct failures
- Be human-readable
- Avoid noise spam
- Avoid leaking secrets

Important actions should be traceable.

---

# Security Expectations

Never:

- hardcode secrets
- commit credentials
- trust client input blindly
- expose internal stack traces publicly

Always:

- validate inputs
- sanitize outputs
- use least-privilege access
- assume hostile input

---

# Performance Philosophy

Do not optimize prematurely.

First optimize for:

- correctness
- clarity
- maintainability

Only optimize performance after identifying real bottlenecks.

Measure before optimizing.

---

# Git & Change Management

Prefer:

- small commits
- focused PRs
- descriptive commit messages
- reversible migrations

Avoid mixing unrelated concerns in one change.

---

# Testing Expectations

Critical paths should have:

- automated tests where practical
- reproducible validation steps
- clear failure signals

When tests are absent:

- provide manual verification steps

---

# UI/UX Principles

Interfaces should prioritize:

- clarity
- speed
- accessibility
- low friction
- predictable behaviour

Avoid unnecessary animations or visual complexity.

---

# Operational Philosophy

This project should remain operable under:

- degraded conditions
- partial outages
- operator fatigue
- imperfect documentation
- constrained resources

Design for real-world operational resilience.

---

# Communication Style

When explaining technical decisions:

- be concise
- avoid unnecessary jargon
- explain reasoning clearly
- surface tradeoffs honestly

Prefer practical recommendations.

---

# Anti-Patterns

Avoid introducing:

- unnecessary dependencies
- giant god-objects
- fragile implicit coupling
- premature scalability architecture
- hidden business logic
- configuration sprawl

---

# Preferred Output Format

When proposing implementation work:

1. Summary
2. Risks
3. Proposed approach
4. Files affected
5. Implementation steps
6. Validation steps
7. Follow-up improvements

---

# Project Context Rules

If project context is incomplete:

- state assumptions explicitly
- avoid hallucinating architecture
- prefer asking targeted questions over inventing systems

---

# Long-Term Goal

Build systems that:

- survive maintenance turnover
- remain understandable over time
- degrade gracefully
- can evolve incrementally
- reduce operational burden
- maximize real-world usefulness
