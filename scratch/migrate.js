const mysql = require('mysql2/promise');

const main = async () => {
  const host = process.argv[2] || '34.28.67.136';
  const port = parseInt(process.argv[3] || '3306');
  
  console.log(`Attempting to connect to database at ${host}:${port}...`);
  try {
    const conn = await mysql.createConnection({
      host: host,
      port: port,
      user: 'root',
      password: '123DB',
      database: 'translation_center'
    });

    console.log('Connected! Executing migration query...');
    await conn.query('ALTER TABLE jobs ADD COLUMN verbose BOOLEAN NOT NULL DEFAULT FALSE');
    console.log('Migration successful: verbose column added to jobs table.');
    await conn.end();
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
};

main();
