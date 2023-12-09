module.exports = {
  env: 'development',
  dbServer: process.env.NOSQL_DB_HOST || 'http://localhost',
  db: process.env.NOSQL_DB_NAME || 'epadlite',
  dbPort: process.env.NOSQL_DB_PORT || 5984,
  auth: process.env.AUTH || 'auth',
  dicomweb: 'dicomweb_none',
  logger: process.env.LOGGER || true,
  mode: process.env.MODE || 'lite',
};
