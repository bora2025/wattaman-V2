# Automated Railway School Provisioning

The provisioner consumes the attested `school-release.json` produced by the core-release workflow. It rejects mutable API/web/gateway tags before any Railway mutation, creates one isolated project, adds PostgreSQL plus the three application services, mounts `/data`, generates a unique JWT secret through stdin, creates the gateway domain, and binds CORS to that exact origin.

Preview without changing Railway:

```text
node tools/provision-railway-school.js --blueprint school-release.json --distribution core --school-slug angkor-school --school-name "Angkor School"
```

Execute only after reviewing the plan and expected Railway cost:

```text
node tools/provision-railway-school.js --blueprint school-release.json --distribution core --school-slug angkor-school --school-name "Angkor School" --workspace "<workspace>" --execute --confirm-slug angkor-school
```

`--distribution core` is mandatory for a clean WordPress-style school. The provisioner compares it
with both API and web distribution values in the blueprint and stops before creating Railway
resources when they differ. Omitting the flag retains the deliberately conservative
`legacy-full` default; it must not be used with a clean-core blueprint.

Do not execute the command until the release workflow has supplied registry-qualified,
digest-pinned image references and their signed release evidence. A mutable tag or a local Docker
image ID is not an acceptable substitute.

Execution writes a secret-free journal in the current directory. A failure writes a failure journal and deliberately does not delete the project automatically: Railway project deletion is destructive, and the operator must inspect the partially created project before explicitly removing or resuming it.

After services become healthy, create an unpublished Railway template from the clean project with `railway templates create --project <project-id> --environment production --json`. Review the draft in Railway before publication; never generate a template from a project containing customer data. Railway currently creates templates from projects rather than importing a repository-owned JSON template, so `school-release.json` is the immutable release input and the Railway draft is the platform-native output.
