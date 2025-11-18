AJV (Another JSON Schema Validator) is used at runtime to validate JSON data against generated schemas (found under `generated/schemas/`).

Why we have a fallback

Some environments (different bundlers or test runners) can change how dynamic imports resolve. A small fallback (dynamic import or Node resolver) lets the orchestrator find `ajv`/`ajv-formats` reliably across dev/test setups.

Enable runtime validation

Install the packages in the orchestrator package so the loader can import them:

  cd services/orchestrator
  pnpm add ajv ajv-formats

That's it — runtime validation will run when those packages are available.
