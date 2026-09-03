# Decibel SDK 0.7.0 Windows ESM Compatibility V1

`@decibeltrade/sdk` is pinned to `0.7.0`. Its published ESM files use extensionless
relative imports and JSON imports without import attributes. Node 24 rejects those
imports before the package public entrypoint can initialize.

`src/decibel_sdk_runtime_v1.ts` installs a narrowly scoped synchronous resolution
hook. The hook applies only when the importing module is inside the installed
Decibel SDK `dist` directory. It appends `.js` to unresolved relative SDK imports
and supplies `type: json` for SDK JSON imports. It does not modify `node_modules`,
copy SDK logic, construct a signer, or perform a mutation.

Run the credential-free compatibility check with:

```text
npm run decibel:sdk:preflight-v1
```

The production executor remains lazy. Writer initialization and credential loading
occur only after the core lifecycle invokes a real external operation. Any SDK or
writer initialization failure remains fail closed and maps to the existing unknown
outcome taxonomy.
