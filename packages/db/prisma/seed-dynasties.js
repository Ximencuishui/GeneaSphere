// 历史朝代数据预置种子脚本
const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', 'packages', 'db', '.env') });

// 预置朝代数据
const DYNASTIES = [
  {
    id: 1,
    name: '明朝',
    start_year: 1368,
    end_year: 1644,
    geojson_url: '/geojson/dynasties/ming.geojson',
    description: '明朝（1368-1644），中国历史上最后一个由汉族建立的大一统王朝，朱元璋所建。',
    color: '#8B1A1A',
    fill_opacity: 0.12,
    label_position: { lat: 35.0, lng: 110.0 },
  },
  {
    id: 2,
    name: '清朝',
    start_year: 1644,
    end_year: 1912,
    geojson_url: '/geojson/dynasties/qing.geojson',
    description: '清朝（1644-1912），中国最后一个封建王朝，由满族爱新觉罗氏建立。',
    color: '#D4A017',
    fill_opacity: 0.12,
    label_position: { lat: 35.0, lng: 105.0 },
  },
  {
    id: 3,
    name: '民国',
    start_year: 1912,
    end_year: 1949,
    geojson_url: '/geojson/dynasties/republic.geojson',
    description: '中华民国（1912-1949），推翻清朝后的亚洲第一个民主共和国。',
    color: '#5D7B9A',
    fill_opacity: 0.12,
    label_position: { lat: 33.0, lng: 105.0 },
  },
  {
    id: 4,
    name: '现代',
    start_year: 1949,
    end_year: 9999,
    geojson_url: '/geojson/dynasties/modern.geojson',
    description: '中华人民共和国（1949- ），现代中国疆域。',
    color: '#6FA86F',
    fill_opacity: 0.08,
    label_position: { lat: 35.0, lng: 105.0 },
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to PostgreSQL');

  let inserted = 0;
  let updated = 0;

  for (const d of DYNASTIES) {
    const exists = await client.query(`SELECT id FROM historical_dynasties WHERE id = $1`, [d.id]);
    if (exists.rows.length > 0) {
      await client.query(
        `UPDATE historical_dynasties SET name=$1, start_year=$2, end_year=$3, geojson_url=$4, description=$5, color=$6, fill_opacity=$7, label_position=$8 WHERE id=$9`,
        [d.name, d.start_year, d.end_year, d.geojson_url, d.description, d.color, d.fill_opacity, d.label_position, d.id]
      );
      updated++;
      console.log(`Updated: ${d.name} (${d.start_year}-${d.end_year})`);
    } else {
      await client.query(
        `INSERT INTO historical_dynasties (id, name, start_year, end_year, geojson_url, description, color, fill_opacity, label_position, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [d.id, d.name, d.start_year, d.end_year, d.geojson_url, d.description, d.color, d.fill_opacity, d.label_position]
      );
      inserted++;
      console.log(`Inserted: ${d.name} (${d.start_year}-${d.end_year})`);
    }
  }

  // 验证
  const r = await client.query(`SELECT id, name, start_year, end_year FROM historical_dynasties ORDER BY start_year`);
  console.log(`\n=== Result: ${inserted} inserted, ${updated} updated ===`);
  console.log('Dynasties in DB:');
  for (const row of r.rows) {
    console.log(`  #${row.id} ${row.name} (${row.start_year}-${row.end_year})`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
