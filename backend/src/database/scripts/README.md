# Database Migration Scripts

This directory contains scripts for PostgreSQL schema creation and data migration from SQLite.

## Files

- `postgresql-schema.sql` - Complete PostgreSQL schema with all tables, indexes, and constraints
- `migrate-sqlite-to-postgres.ts` - TypeScript script for migrating data from SQLite to PostgreSQL

## PostgreSQL Schema

The schema uses PostgreSQL-specific features:
- `UUID` type for all ID columns (using `uuid-ossp` extension)
- `TIMESTAMPTZ` for all datetime columns (timezone-aware)
- `JSONB` for JSON data (metadata, shiftsData, registration_data)
- `DECIMAL` for monetary values (amount, rate, bonusPerShift)
- Automatic `updatedAt` trigger for all tables

### Creating the Schema

```bash
# Connect to your PostgreSQL database and run:
psql -d your_database -f src/database/scripts/postgresql-schema.sql
```

Or using environment variable:
```bash
psql $DATABASE_URL -f src/database/scripts/postgresql-schema.sql
```

## Data Migration

The migration script supports three modes:

### 1. Direct Migration (SQLite → PostgreSQL)

```bash
# Set environment variables
export SQLITE_PATH=./dev.db
export POSTGRES_URL=postgresql://user:password@localhost:5432/dbname

# Run migration
npx ts-node src/database/scripts/migrate-sqlite-to-postgres.ts migrate
```

### 2. Export to JSON (for backup/review)

```bash
export SQLITE_PATH=./dev.db

# Export to JSON file
npx ts-node src/database/scripts/migrate-sqlite-to-postgres.ts export ./backup.json
```

### 3. Import from JSON

```bash
export POSTGRES_URL=postgresql://user:password@localhost:5432/dbname

# Import from JSON file
npx ts-node src/database/scripts/migrate-sqlite-to-postgres.ts import ./backup.json
```

## Migration Process

1. **Export Phase**: Reads all data from SQLite tables
2. **Transform Phase**: Converts data types:
   - TEXT IDs → UUID (generates new UUIDs while maintaining relationships)
   - DATETIME → TIMESTAMPTZ
   - INTEGER booleans → BOOLEAN
   - TEXT JSON → JSONB
3. **Import Phase**: Inserts transformed data into PostgreSQL
4. **Validation Phase**: Compares row counts between databases

## Data Integrity

The migration script:
- Maintains referential integrity by processing tables in dependency order
- Generates consistent UUIDs for related records
- Validates row counts after migration
- Reports any errors during the process

## Rollback

If migration fails:
1. The PostgreSQL database can be dropped and recreated
2. Re-run the schema creation script
3. Re-run the migration

## Docker PostgreSQL Setup

For local testing:

```bash
# Start PostgreSQL container
docker run --name resto-postgres \
  -e POSTGRES_USER=resto \
  -e POSTGRES_PASSWORD=resto123 \
  -e POSTGRES_DB=resto \
  -p 5432:5432 \
  -d postgres:15

# Set connection string
export POSTGRES_URL=postgresql://resto:resto123@localhost:5432/resto

# Create schema
psql $POSTGRES_URL -f src/database/scripts/postgresql-schema.sql

# Run migration
npx ts-node src/database/scripts/migrate-sqlite-to-postgres.ts migrate
```
