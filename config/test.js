module.exports = {
  env: 'test',
  dbServer: 'http://localhost',
  db: 'testdb_epadlite',
  dbPort: process.env.PORT || 5984,
  auth: 'none',
  dicomweb: 'dicomweb_none',
  logger: {
    level: 'error',
  },
  mode: 'thick',
  thickDb: {
    name: 'test_epaddb',
    host: 'localhost',
    port: '3306',
    user: 'root',
    pass: 'mymariasecret',
    logger: false,
  },
  limitStudies: 100,
};
