module.exports = {
  env: 'test',
  dbServer: 'http://localhost',
  db: 'testdb_epadlite',
  dbPort: process.env.PORT || 5984,
  auth: 'none',
  dicomweb: 'dicomweb_oidc',
  logger: true,
};
