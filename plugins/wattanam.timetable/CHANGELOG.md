# Changelog

## 0.2.2

- Add covering indexes for 14 foreign keys (migrations 011-024) so lookups, cascades and parent deletes stay fast as school data grows. Additive only; no data changes.

## 0.2.1

- Replace the unused durable-event grant with the least-privilege database transaction capability.

## 0.2.0

- Upgrade timetable, subject, classroom, teacher, lesson, schedule, and attendance workspaces to the universal SDK 1.3 declarative UI contract.

## 0.1.6

- Cast teacher attendance check-in timestamps explicitly for PostgreSQL runtime compatibility.

## 0.1.5

- Declare the operational contract and expose the standard runtime health probe.

## 0.1.4

- Declare Academic Management as the required provider for stable class identity.
- Publish a dashboard contribution for extension-driven lean-core navigation.
- Add real-PostgreSQL lifecycle certification without changing published migration bytes.

## 0.1.3

- Provide the rich timetable workspace, constrained generation, stable directory references and
  teacher lesson-attendance workflows.
