# WordPress-style extension-driven navigation and dashboard evidence

Date: 2026-09-26  
Scope: lean-core navigation and dashboard composition

## Implemented boundary

- Core mode admits only the approved permanent administration links from the static ownership
  registry. Optional business links are not rendered unless an active plugin contributes them.
- The backend returns permission-filtered navigation extensions from active plugin runtimes.
- Desktop navigation, the mobile drawer and mobile tabs now consume the same composed registry;
  mobile tabs are no longer calculated from the static pre-extension input.
- A plugin navigation contribution may include bounded dashboard metadata: title, description and
  priority. It may explicitly opt out of the dashboard while remaining in navigation.
- Dashboard cards reject routes outside the contributing plugin namespace and sort explicit cards
  by plugin-supplied priority.
- Attendance Manager proves the richer contract with an explicit dashboard contribution.

Core operational cards remain static because users, plugins, health and recovery are permanent
kernel capabilities. All optional school-business cards are supplied by active, permission-granted
plugins.

## Verification

- Plugin extension service suite passes 15 tests, including permission-filtered and invalid
  dashboard metadata cases.
- The architecture/tool suite passes 69 tests, including core navigation, dashboard namespace,
  core-route and ownership gates.
- Backend and frontend TypeScript checks pass.

