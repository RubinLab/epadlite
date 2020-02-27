const fs = require('fs-extra');
const path = require('path');

const env = process.env.NODE_ENV || 'development';
const config = require(`./${env}`); // eslint-disable-line
config.authConfig = {};
if (
  config.auth &&
  config.auth !== 'none' &&
  fs.existsSync(path.join(__dirname, `${config.auth}.json`))
)
  config.authConfig = require(`./${config.auth}.json`); // eslint-disable-line

// check values of environment variables
config.authConfig.realm = process.env.AUTH_REALM || config.authConfig.realm || 'ePad';
// giving a default of hostname doesn't make sense here it wont work but at least it wouldn't be empty
config.authConfig.authServerUrl =
  process.env.AUTH_URL || config.authConfig.authServerUrl || 'http://hostname';
config.authConfig.clientId =
  process.env.AUTH_CLIENT_ID || config.authConfig.clientId || 'epad-auth';

config.dicomWebConfig = {};
if (config.dicomweb && fs.existsSync(path.join(__dirname, `${config.dicomweb}.json`)))
  config.dicomWebConfig = require(`./${config.dicomweb}.json`); // eslint-disable-line
// check values of environment variables
// giving a default of hostname doesn't make sense here it wont work but at least it wouldn't be empty
config.dicomWebConfig.baseUrl =
  process.env.DICOMWEB_BASEURL || config.dicomWebConfig.baseUrl || 'http://hostname';

config.mode = process.env.MODE || config.mode || 'lite'; // default lite
config.imageExt = process.env.IMAGE_EXT || config.imageExt || 'jpg|jpeg|png';
config.reportExt = process.env.REPORT_EXT || config.reportExt || 'txt|pdf';
config.validExt = `${config.imageExt}|${config.reportExt}`;
config.prefix = process.env.PREFIX || config.prefix || '';
config.thickDb = config.thickDb || {
  name: process.env.SQL_DB_NAME || 'epaddb',
  host: process.env.SQL_DB_HOST || 'localhost',
  port: process.env.SQL_DB_PORT || '3306',
  user: process.env.SQL_USER || 'pacs',
  pass: process.env.SQL_PASS || 'pacs',
};
config.maxConcurrent = config.maxConcurrent || 5;
module.exports = config;
