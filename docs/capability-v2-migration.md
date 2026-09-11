# Capability v2 migration — release held

Workouts declares only `collection.read`, `records.create`, `records.edit` and
`records.delete` under capability contract 2. Manifest format remains 1.
Setup authority derives from exact type-pack provisions, not broad
`definitions.manage` or a setup alias. No file, timer or offline-replica rights
are requested. Contract digests, resource bytes, full-collection scope, origins
and base path are preserved.

## Required sequence

1. Qualify and deploy beta.95 readers, retaining fresh v1 issuance only.
2. Qualify and deploy a subsequent v2 writer with beta.95 as rollback predecessor.
3. Complete consumer acceptance, then release Workouts through its normal paths.

The SDK can support v2 before the server permits fresh v2 issuance. Do not
trigger auto-deploying main, development deployment or publication before these
gates. No consumer commit, push or deployment has occurred.

## Current beta96 v2 candidate provenance

The active SDK pins now use authentic `0.1.0-beta.96` SHA-qualified development
packs from committed product source
`56ed32ffde0544ca497e854702d87ef2c175b954`, supplied by the parent at
`/home/calluma/projects/mdbase-connect/.ops/artifacts/v2-sdk-56ed32ffde05`.
The parent generated these with `pack-consumer-sdk.mjs` for phase
`v2-enablement`, supporting capability contracts `[1, 2]`.
These are **not signed Q artifacts or an npm publication**.

The existing vendor subset is preserved. Every copied archive was checked against
the supplied manifest's byte length and SHA-512, and its package version was
checked as `0.1.0-beta.96`. `vendor/mdbase-connect-sdk.json` records the new
revision, filenames, sizes and SHA-512 values. Dependency and transitive override
pins are updated together; package-manager installation regenerates the lockfile.
No archive is patched or relabelled and no package dependency is added.

The beta95 account below is historical, superseded for active pins by this
candidate. Release remains held: the parent owns rollout ordering, live/native
acceptance, and repinning immutable final release artifacts before consumer
publication if required. Existing v1 sessions remain retained; updated consent
requires explicit reauthorization without silent conversion or fallback.

## Historical beta95 provenance and readiness

Connect, protocol, devkit and testing use actual beta.95 tarballs produced by
product `package:consumer` from clean source
`408c67bc10f128e0833f0da62cb3efb9d94657d7`. Dependencies, overrides,
`package-lock.json` and vendor provenance were updated together. Parent checked
every artifact size/SHA-512 and verified unrelated lock entries are unchanged.
Sync is not required by this dependency graph.

These are source-bound local SDK builds, not signed images or published npm
artifacts. Existing artifact identities were not reused and vendor code was not
patched.

`src/lib/connect.ts` leaves declaration-derived authorization and setup to the
SDK. The gate requires SDK readiness and now checks `update.canApply` in the
setup handler as well as the UI. Updated access requires explicit consent;
there is no legacy operation override, silent expansion or v2-to-v1 fallback.

## Parent validation (Node 24.19.0)

- Installation passed during integration.
- Final typecheck, complete `npm test` and production build passed.
- Tests: 40 Vitest cases, two manifest cases and six deployment-script cases.
- Strict installed-protocol validation and transactional type-pack verification
  passed, preserving 10 resources and five contracts.
- Four new hermetic tests use the genuine SDK, cryptographic key stores and
  fixture transport: signed v2 requests with exact provision-derived setup,
  denial without retry/navigation, rejected legacy operation overrides, and
  rejection of an unbound saved-grant fixture without applying setup.

These tests do not establish live consent or validity of a retained v1 grant.
Parent-owned isolated acceptance remains required for real denial/revocation,
retained valid v1 grants under the same application identity, reauthorization,
provision setup, selection/reconnect and record operations. No browser or shared
LAB acceptance has run for this draft. Local build success is not release
eligibility or proof of a deployed v2-writer server.

## Beta96 candidate integration results — 2026-09-09

- `npm run typecheck` and `npm run build`: passed, including installed
  manifest validation and production PWA build.
- Vitest: **9 files / 43 tests passed** (all original 40 retained, plus one
  v1-only-server authorization rejection and two local timer regressions).
- Both manifest tests passed when counted with `node --test --test-isolation=none`;
  transactional type-pack verification passed (10 resources / 5 contracts).
- Full `npm test` remains failed at the deployment-script test stage. The default
  Node runner reports one failed test file; diagnostic execution without process
  isolation reports **6 failed / 0 passed** assertions because subprocess output
  is empty. Production/configuration rejection exit statuses were observed, but
  the required stdout/stderr assertions did not pass. No assertions were weakened.
  The SDK Vitest tests initially failed 3 / 42 before health fixtures were fixed.

The installed beta96 SDK checks `/health` for
`application-authorization-v2-issuance` before fresh v2 authorization. TaskNotes,
Workouts and Pickle hermetic transport fixtures now model that endpoint; they
still assert exact signed intent and denial. Workouts additionally verifies a
v1-only server returns `capability_contract_incompatible` without an authorization
request or navigation. No production application source, authority declaration,
retained-session migration, or native route changed in this integration pass.

All checks used Node `v24.19.0` via the requested PATH. Initial cache writes
failed with `EROFS`; existing package-manager caches were copied into the private
log directory under `/tmp`, then offline installation succeeded in all four
worktrees (`pnpm install --no-frozen-lockfile --prod=false --offline --store-dir …`
or `npm install --include=dev --offline --cache …`). Lockfiles were regenerated
by package managers, with formatting restored where required. Every unrelated
package/snapshot lock entry is structurally unchanged from the starting draft.
No dependencies, audit waivers or timeout increases were introduced.

These are local fixture/unit results, not live browser, daemon, or native
acceptance. Parent acceptance still needs fresh registration and explicit v1
reauthorization, retained valid v1 grants, denial/revocation and recovery, exact
contract/setup and readonly view behavior, typed records and revision guards,
TaskNotes/Planner saved views, Workouts timers, and actual opt-in notifications
and opaque Pickle wakeups across the supported providers and native callbacks.
Parent owns release ordering and immutable final artifact repinning before
publication if required. Reader, bundled clients and canonical Connect were not
edited; no agents, browser operations, credentials, live service acceptance,
commits, pushes, publishing or deployments were used.

Private logs: `/tmp/v2-consumer-sdk-integration-20260909T130351/workout_tracker`.
