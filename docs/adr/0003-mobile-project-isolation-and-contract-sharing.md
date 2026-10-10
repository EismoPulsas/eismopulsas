# ADR-0003: Isolate mobile/ from the root Next.js tooling; share the contract by a type-only import

Status: Accepted

Date: 2026-10-10

Deciders: Hack4Vilnius team (Eismo Pulsas); root config changes authorised by the project owner for this task. Recorded by a coding agent.

## Context

- ADR-0001 put the Expo app in `mobile/` as a separate npm project (not a workspace). It also recorded expected collisions with the root config. These were verified against the files on 2026-10-10:
  - root `tsconfig.json` includes `**/*.ts(x)`, so `next build` would type-check React Native code;
  - root ESLint (flat config, `eslint` with no paths) lints everything under the root;
  - root `.gitignore` has a root-anchored `/node_modules`.
- ADR-0001 planned to **mirror** the API types in `mobile/` and accepted the drift risk.
- The Expo SDK 57 template keeps routes in `mobile/src/app/` and uses its own flat ESLint config via `expo lint`. ESLint searches upwards for a config, so without one in `mobile/` it finds the root config.

## Decision

1. **Root isolation**, the smallest change set:
   - root `tsconfig.json` `exclude` gains `"mobile"`;
   - root `eslint.config.mjs` `globalIgnores` gains `"mobile/**"`;
   - root `.gitignore` gains `/mobile/node_modules/` and `/mobile/.expo/` as a safety net. `mobile/.gitignore` from the Expo template remains the primary ignore file.
2. **`mobile/` owns its tooling:** `package.json`, `package-lock.json`, `tsconfig.json` (extends `expo/tsconfig.base`) and `eslint.config.js` (`eslint-config-expo/flat`). Packages are added with `npx expo install`. No npm workspaces, no Turborepo/Nx.
3. **The contract has one source:** `lib/mobility/types.ts`.
   - `mobile/src/api/contract.ts` re-exports its types with `export type { … } from "../../../lib/mobility/types"`.
   - Babel strips type-only imports, so Metro never bundles code from outside `mobile/`. This was verified with `npx expo export --platform android`.
   - The mobile `tsc` type-checks the shared file, so a contract change that breaks the app fails `npx tsc --noEmit` in `mobile/`.
   - Rule: `lib/mobility/types.ts` stays **types only, no imports**. Value imports across the boundary are not allowed.

## Alternatives considered

- **Mirrored copy of the types** (ADR-0001's plan). Simpler mentally, but the copies drift silently. Rejected now that a zero-dependency type-only import is proven to work.
- **npm workspaces / shared `packages/contract`.** Changes the root `package.json` and lockfile, and needs Metro `watchFolders` configuration. Not worth it for one types file during a hackathon.
- **A separate repository for the app.** Rejected in ADR-0001.

## Consequences

- **Positive:**
  - `next build` and root lint ignore `mobile/`. Verified: root `npm run lint` and `npm run build` pass, and lint without a mobile config reports every mobile file as ignored.
  - Contract drift between the BFF and the app becomes a compile error.
- **Negative / accepted risks:**
  - `mobile/` reaches into `../lib/mobility/types.ts`, so a mobile-only checkout or EAS build of only `mobile/` would lack the file. EAS uploads the git repository root, so this is fine today; revisit if the app moves out of the repo.
  - Someone could add a runtime import to `types.ts`; mobile lint and the Metro build would then fail loudly.
- **Docs updated:** STRUCTURE.md › B2, B5; AGENTS.md (contract rule); TESTING.md › B1.

## References

- `tsconfig.json`, `eslint.config.mjs`, `.gitignore` (root); `mobile/tsconfig.json`, `mobile/eslint.config.js`, `mobile/src/api/contract.ts`
- Expo ESLint guide: https://docs.expo.dev/guides/using-eslint/
