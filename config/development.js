module.exports = {
  env: 'development',
  dbServer: 'http://localhost',
  db: 'epadlite',
  dbPort: process.env.PORT || 5984,
  auth: 'none',
  dicomweb: 'dicomweb_oidc',
  logger: true,
};
