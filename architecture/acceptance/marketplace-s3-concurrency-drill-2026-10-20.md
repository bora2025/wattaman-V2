# Marketplace two-instance S3 concurrency drill

- Date: 2026-10-20 (Asia/Phnom_Penh)
- Environment: Railway `marketplace` / `production`
- Deployment: `ce993ab8-912c-467e-a480-77e2232b9f48`
- API topology: two running replicas in `asia-southeast1-eqsg3a`
- Artifact provider: S3-compatible Railway bucket
- Local API volume: detached; retained 50 GB volume is `READY` and unassigned for rollback

## IaC safety evidence

The pinned production plan reported `0 to add, 2 to change, 0 to destroy`. The two changes were:

1. Set the Marketplace API region replica count to two.
2. Detach the legacy `/data` volume from the API service without deleting the volume resource.

After apply, Railway reported both deployment instances `RUNNING`, no API volume mounts, and the retained volume in `READY` state.

## Concurrent traffic evidence

- 24 concurrent `/health/ready` requests: 24 passed.
- 24 concurrent downloads of `wattanam.human-resources` artifact `84380e07f5a6eb5e8ec8bf967648e0f872ceb575942db0522e3a353a725ede52`: 24 completed, zero transport errors.
- SHA-256 verification: all 24 downloads matched the catalog digest; zero mismatches.
- Production logs showed two independent container startups and successful artifact/readiness traffic without runtime errors.

## Result

PASS. The Marketplace API can run with two replicas while serving immutable artifacts from shared S3 storage. The local artifact volume is no longer part of the serving path and remains available for rollback until the retention decision is separately approved.
