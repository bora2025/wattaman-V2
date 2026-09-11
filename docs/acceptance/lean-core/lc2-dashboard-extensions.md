# LC2-011 dashboard extensions acceptance

Status: **accepted** on 2026-09-11.

## Composition

The administrator page selects its dashboard from the validated frontend distribution:

- `legacy-full` mounts the existing attendance/reporting dashboard unchanged.
- `core` mounts `CoreAdminDashboard`, which calls only plugin-extension and platform-billing core
  endpoints. It does not connect to the attendance gateway or query report, class-progress, or
  monthly-trend APIs.

The core dashboard contains fixed operational cards for users, plugins, system health and backup.
Business feature cards are derived from `/api/plugin-api/my-extensions`, whose backend response is
limited to extensions registered by active plugins and allowed for the current principal. The
frontend adapter additionally rejects anonymous, cross-plugin, and path-traversal contributions.

This is the LC-2 bridge contract: navigation contributions provide simple discovery cards. LC3-008
later introduces richer declarative dashboard cards and charts without restoring hard-coded
business knowledge to core.

## Verification

- Contract tests reject invalid plugin card contributions.
- A source boundary test proves the core dashboard has no legacy dashboard API or socket usage.
- Frontend production build, architecture inventory and repository tool gates pass.

