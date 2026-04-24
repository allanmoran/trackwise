#!/usr/bin/env node

/**
 * test-cloud-connection.js — Quick test to verify Neon Postgres is accessible
 */

import postgres from 'postgres';

const CLOUD_URL = 'postgresql://neondb_owner:npg_5ukmJpGFd7al@ep-sweet-boat-a7jldduk-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

console.log('🔗 Testing Neon Postgres connection...\n');

try {
  const sql = postgres(CLOUD_URL, {
    ssl: 'require',
    idle_timeout: 10,
  });

  console.log('⏳ Connecting to cloud database...');

  const result = await sql`SELECT NOW()`;

  console.log('✅ Connection successful!\n');
  console.log('Cloud database is accessible and responding.\n');
  console.log('You can now run: npm run recover\n');

  await sql.end();
  process.exit(0);

} catch (err) {
  console.error('❌ Connection failed:\n');
  console.error('Error:', err.message);
  console.error('\nPossible causes:');
  console.error('  • Network is blocked (check firewall/VPN)');
  console.error('  • Cloud database has been deleted');
  console.error('  • Connection string is invalid');
  console.error('  • Credentials have been rotated');
  console.error('\nFallback: Run "npm run load" to seed from historical data instead.\n');
  process.exit(1);
}
