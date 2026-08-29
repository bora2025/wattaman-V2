# ADR-0008: Operational Telemetry

Status: **Proposed, not yet implemented** — blocked on **DEC-012** at Gate **D0**. Unlike the other ADRs in this index, this one records a decision with **zero corresponding code today**: a repository-wide search for `telemetry`/`Telemetry` across `backend/src` returns no matches. This ADR exists so the boundary is decided *before* any telemetry code is written, not retrofitted after.

## Context

Operating a fleet of independently-hosted school installations without any visibility (install health, update success/failure, plugin crash rates) makes support and release-quality work almost entirely reactive — support only learns a release is broken when a school reports it. But this product's core promise (DEC-006: offline-first, no continuous cloud dependence) and the sensitivity of what these systems store (see [data-classification.md](../data-classification.md): most subjects are minors) both push hard against ambient data collection.

## Decision

**Opt-in operational telemetry only; no student, grades, attendance, fees, messages, or location payloads — ever, regardless of opt-in state.**

- Telemetry is **off by default**. A school owner must affirmatively opt in; there is no "opted in unless you find the setting and turn it off" default.
- The payload is scoped to **installation/release health identifiers only**: e.g. installation ID, core version, plugin IDs + versions installed, update success/failure, crash/error class (not message bodies), uptime/health-check results. It never includes the content of any Tier 2/3 field from [data-classification.md](../data-classification.md) — no student, grade, attendance, fee, message, or location payload, under any configuration.
- This is the same boundary [publisher-privacy-security-v1.0.md](../../policies/publisher-privacy-security-v1.0.md) already applies to publisher-submitted plugins ("Student, grade, attendance, fee, health, location, and communication data are confidential school data and may not be used for advertising or unrelated model training") — telemetry must not become a backdoor around a rule the platform already enforces on publishers.
- Support bundles (a related but distinct mechanism, §13.5) are generated **locally**, redacted, previewed to the school owner, and uploaded only with explicit consent per-incident — they are not the same thing as always-on telemetry, and this ADR does not relax that separate control.

## Consequences

- Because nothing is built yet, this ADR is the design contract the eventual implementation must satisfy — any future telemetry PR should be reviewed against "off by default, health-identifiers only, no Tier 2/3 payload, ever" before merge, not after.
- Support and release engineering continue to operate **without fleet-wide visibility** until this is built and schools opt in — B-009 (support runbooks) and D-007 (outage/failure test suite) currently rely on schools self-reporting problems, not on telemetry dashboards.
- An opt-in model means telemetry coverage will always be partial (only schools that opted in are visible) — release-health decisions cannot assume telemetry data is representative of the whole fleet, and must not be designed as if it will be.
- This is listed as an A-004 threat-model input, not just a privacy note: an internal actor or a compromised telemetry ingestion endpoint is a threat that must be modeled *before* telemetry exists, because retrofitting security onto a live data-collection pipeline is much harder than designing it in from the start (see [threat-model.md](../threat-model.md)).

## Alternatives considered

- **Opt-out (collect by default, let schools disable it)**: rejected — given the population is mostly minors and the product's own data-classification work treats that as the default assumption for severity, an opt-out default would put the burden of noticing and acting on the school, not the platform.
- **No telemetry at all, ever**: considered, but rejected as the Version 1 default — some fleet-health visibility materially improves release-quality and incident response, and an *opt-in* model captures that benefit without the opt-out model's privacy posture problem. This remains a `proposed` default the Product Owner can still override at Gate D0.

## Related

[DEC-012](../../platform-master-execution-plan.md#2-product-and-architectural-decisions) · [data-classification.md](../data-classification.md) · [publisher-privacy-security-v1.0.md](../../policies/publisher-privacy-security-v1.0.md) · [privacy-policy-v1.0.md](../../policies/privacy-policy-v1.0.md) · threat-model.md (A-004) · B-009, D-007 (currently telemetry-independent)
