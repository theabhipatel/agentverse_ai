#!/bin/sh
# Migrations run before the server accepts traffic, so a deploy can never serve
# an application that is ahead of its database schema. Seeding follows and is a
# no-op once the administrator exists.
set -e

node dist/db/migrate.js
node dist/db/seed.js

exec "$@"
