module.exports = {
  env: 'development',
  dbServer: 'http://localhost',
  db: 'epadlite',
  dbPort: process.env.PORT || 5984,
  auth: 'auth',
  dicomweb: 'dicomweb_none',
  logger: true,
  https: false,
  mode: 'lite',
};
