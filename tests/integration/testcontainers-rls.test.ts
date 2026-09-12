import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';

describe('Testcontainers — Isolation multi-tenant PostgreSQL', () => {
  let container: StartedPostgreSqlContainer;
  let adminClient: Client;
  let rlsClient: Client;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-bookworm')
      .withDatabase('test_schoolpro')
      .withUsername('admin')
      .withPassword('admin')
      .start();

    // Admin client (superuser — crée le schéma)
    adminClient = new Client({ connectionString: container.getConnectionUri() });
    await adminClient.connect();

    // Créer un rôle non-superuser pour tester RLS
    await adminClient.query(`
      CREATE ROLE rls_user WITH LOGIN PASSWORD 'rls_pass';
      GRANT USAGE ON SCHEMA public TO rls_user;
    `);

    // Créer le schéma
    await adminClient.query(`
      CREATE TABLE tenants (
        id TEXT PRIMARY KEY,
        nom TEXT NOT NULL
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL REFERENCES tenants(id),
        siteId TEXT,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'teacher'
      );

      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL REFERENCES tenants(id),
        eleveId TEXT NOT NULL,
        valeur INTEGER NOT NULL
      );

      -- RLS + FORCE
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
      ALTER TABLE users FORCE ROW LEVEL SECURITY;
      ALTER TABLE notes FORCE ROW LEVEL SECURITY;

      -- Politique : un user ne voit que les lignes de son tenant
      CREATE POLICY tenant_isolation_users ON users
        USING (tenantId = current_setting('app.tenant_id', true));

      CREATE POLICY tenant_isolation_notes ON notes
        USING (tenantId = current_setting('app.tenant_id', true));

      -- Données
      INSERT INTO tenants (id, nom) VALUES ('tenant-a', 'École A'), ('tenant-b', 'École B');
      INSERT INTO users (id, tenantId, siteId, email, role) VALUES
        ('u1', 'tenant-a', 'site-1', 'teacher@a.com', 'teacher'),
        ('u2', 'tenant-b', 'site-1', 'teacher@b.com', 'teacher');
      INSERT INTO notes (id, tenantId, eleveId, valeur) VALUES
        ('n1', 'tenant-a', 'e1', 15),
        ('n2', 'tenant-b', 'e2', 12);
    `);

    // Accorder les permissions après création des tables
    await adminClient.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO rls_user;');

    // RLS client (non-superuser)
    const uri = container.getConnectionUri().replace('admin:admin', 'rls_user:rls_pass');
    rlsClient = new Client({ connectionString: uri });
    await rlsClient.connect();
  }, 60000);

  afterAll(async () => {
    await rlsClient?.end();
    await adminClient?.end();
    await container?.stop();
  });

  it('isole les données par tenant (tenant-a ne voit pas tenant-b)', async () => {
    await rlsClient.query("SET app.tenant_id = 'tenant-a'");
    const result = await rlsClient.query('SELECT * FROM users');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tenantid).toBe('tenant-a');
    expect(result.rows[0].email).toBe('teacher@a.com');
  });

  it('isole les notes par tenant', async () => {
    await rlsClient.query("SET app.tenant_id = 'tenant-b'");
    const result = await rlsClient.query('SELECT * FROM notes');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tenantid).toBe('tenant-b');
    expect(result.rows[0].valeur).toBe(12);
  });

  it('empêche l\'accès sans contexte tenant (fail-closed)', async () => {
    await rlsClient.query('RESET app.tenant_id');
    const result = await rlsClient.query('SELECT * FROM users');
    expect(result.rows).toHaveLength(0);
  });

  it('permet l\'accès au super-admin en bypassant RLS', async () => {
    const result = await adminClient.query('SELECT * FROM users');
    expect(result.rows).toHaveLength(2);
  });
});
