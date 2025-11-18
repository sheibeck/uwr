Admin server (programmatic)

Quick usage

- Start locally (defaults to user `admin`, pass `password`):

  ADMIN_USER=admin ADMIN_PASS=password pnpm --filter @uwr/orchestrator run admin:serve

Environment variables

- ADMIN_USER - username for basic auth (default: `admin`)
- ADMIN_PASS - password for basic auth (default: `password`)
- ADMIN_PORT - port (default: 3005)
- ADMIN_HOST - host to bind (default: 127.0.0.1)

Security recommendations

- These defaults are for local development only. When deploying to a shared
  environment, always set strong credentials and bind the service to
  127.0.0.1 or place it behind an authenticated reverse proxy.
- Consider replacing basic auth with a stronger mechanism (OAuth, JWT)
  for production.
