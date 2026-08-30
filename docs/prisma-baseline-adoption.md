# Adopción de la baseline Prisma

La baseline permite reconstruir una base vacía con `prisma migrate deploy`.
La base histórica de producción se creó con `prisma db push`, por lo que el
primer cambio a migraciones versionadas requiere adoptar sólo la metadata.

## Gate obligatorio

Antes de ejecutar `migrate resolve`, deben cumplirse los tres puntos:

1. Backup PostgreSQL reciente y no vacío.
2. `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`
   devuelve exactamente `-- This is an empty migration.`.
3. Las 40 migraciones aplican en orden sobre PostgreSQL 16 vacío y el diff
   final también es vacío.

Si cualquiera falla, no se marca ninguna migración como aplicada.

## Adopción de una base histórica ya alineada

Con los ficheros exactos de la versión que se va a desplegar dentro del
contenedor:

```bash
for migration in prisma/migrations/*/; do
  node node_modules/prisma/build/index.js migrate resolve \
    --applied "$(basename "$migration")"
done
node node_modules/prisma/build/index.js migrate status
```

`resolve --applied` no ejecuta el SQL: registra que el schema histórico ya
contiene esos cambios. Después de esta adopción, el entrypoint usa únicamente
`migrate deploy`; queda prohibido recuperar `db push --accept-data-loss`.

## Rollback

Si la adopción de metadata se interrumpe antes del despliegue, el schema de
negocio no cambia. Conservar el dump previo y no borrar `_prisma_migrations` a
mano: completar o reparar el historial con `prisma migrate resolve` sobre la
misma versión revisada.
