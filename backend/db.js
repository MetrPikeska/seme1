const { Pool } = require("pg");

const pool = new Pool({
  host: "localhost",
  user: "postgres",
  password: "master",
  database: "klima",
  port: 5432
});

pool.on('connect', () => {
  console.log('[INFO] Database connected successfully!');
});

pool.on('error', (err) => {
  console.error('[ERROR] Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params)
};
