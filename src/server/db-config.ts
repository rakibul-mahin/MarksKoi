import type { PoolConfig } from "pg";

/**
 * Builds the node-postgres pool config.
 *
 * node-postgres treats `sslmode=require` as "require AND verify the certificate". Supabase's
 * certificates are issued by Supabase's own root CA, which Node does not trust by default, so
 * a plain `sslmode=require` URL fails with SELF_SIGNED_CERT_IN_CHAIN. When DATABASE_CA_CERT holds
 * that CA (PEM, `\n`-escaped allowed), we verify the server against it. Connection-string SSL
 * parameters are stripped in that case because they would override the explicit `ssl` option.
 */
export function buildPoolConfig(connectionString: string, caCert: string | undefined): PoolConfig {
  const ca = caCert?.trim() ? caCert.replace(/\\n/g, "\n").trim() + "\n" : null;
  if (!ca) return { connectionString };
  const url = new URL(connectionString);
  for (const p of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat", "ssl"]) url.searchParams.delete(p);
  return { connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true } };
}
