# Vendored prerelease SDKs

The revision-stamped core and Connect SDK tarballs make this coordinated
prerelease change installable before its registry releases exist. The adjacent
JSON manifests record immutable source revisions, byte sizes, and SHA-512
digests.

Refresh them from the respective SDK worktrees with:

```sh
npm run package:consumer -- --destination /path/to/mdbase-workouts/vendor
pnpm package:consumer --destination /path/to/mdbase-workouts/vendor --packages connect,protocol
```

Then update the `file:` references and run `npm install`. Return to exact npm
versions after the coordinated releases are published.
