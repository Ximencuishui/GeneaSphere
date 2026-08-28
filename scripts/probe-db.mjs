import pg from 'pg';
import net from 'net';

console.log('=== test 1: TCP socket ===');
const sock = net.connect(15432, '127.0.0.1');
sock.setTimeout(8000);
sock.on('connect', () => console.log('TCP connected'));
sock.on('data', (d) => console.log('Recv:', d.toString()));
sock.on('error', (e) => console.log('TCP error:', e.message));
sock.on('timeout', () => { console.log('TCP timeout, no data'); sock.destroy(); });
setTimeout(() => sock.destroy(), 10000);

console.log('=== test 2: pg client with detailed log ===');
const client = new pg.Client({
  host: '127.0.0.1',
  port: 15432,
  user: 'geneauser',
  password: 'GeneaSphere2024!',
  database: 'geneasphere',
  connectionTimeoutMillis: 10000,
  statement_timeout: 10000,
});
client.on('error', (e) => console.log('pg error event:', e.message, e.code));
client.on('connect', () => console.log('pg connect event'));
client.on('end', () => console.log('pg end event'));
try {
  await client.connect();
  console.log('pg.connect() resolved');
  const r = await client.query('SELECT 1 AS ok');
  console.log('Query result:', r.rows);
  await client.end();
} catch (e) {
  console.error('pg error:', e.code, '-', e.message);
}
process.exit(0);