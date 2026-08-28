import pg from 'pg';
const c = new pg.Client({ host: '127.0.0.1', port: 15432, user: 'geneauser', password: 'GeneaSphere2024!', database: 'geneasphere' });
await c.connect();
const r = await c.query(`UPDATE clans SET slug='zhuxi-demo' WHERE name LIKE '朱熹族谱%' AND slug IS NULL RETURNING id, name, slug`);
console.log('已修复:', r.rows);
await c.end();