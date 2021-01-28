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
if (config.auth !== 'external') {
  config.authConfig.realm = process.env.AUTH_REALM || config.authConfig.realm || 'ePad';
  // giving a default of hostname doesn't make sense here it wont work but at least it wouldn't be empty
  config.authConfig.authServerUrl =
    process.env.AUTH_URL || config.authConfig.authServerUrl || 'http://hostname';
  config.authConfig.clientId =
    process.env.AUTH_CLIENT_ID || config.authConfig.clientId || 'epad-auth';
} else {
  config.authConfig.userinfoUrl =
    process.env.AUTH_USERINFO_URL ||
    config.authConfig.userinfoUrl ||
    'http://hostname/keycloak/auth/realms/ePad/protocol/openid-connect/userinfo';
}
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
config.validExt = `${config.imageExt}|${config.reportExt}|csv`;
config.prefix = process.env.PREFIX || config.prefix || '';
config.thickDb = config.thickDb || {
  name: process.env.SQL_DB_NAME || 'epaddb',
  host: process.env.SQL_DB_HOST || 'localhost',
  port: process.env.SQL_DB_PORT || '3306',
  user: process.env.SQL_USER || 'pacs',
  pass: process.env.SQL_PASS || 'pacs',
  logger: process.env.SQL_LOGGER || 'false',
};
config.maxConcurrent = config.maxConcurrent || 5;
config.disableStats = config.disableStats || false;
config.statsEpad = config.statsEpad || 'https://epad-public.stanford.edu';
config.limitStudies = process.env.LIMIT_STUDIES || config.limitStudies;
config.unassignedProjectID = config.unassignedProjectID || 'nonassigned';
config.XNATUploadProjectID = config.XNATUploadProjectID || 'all';
config.pollDW =
  // eslint-disable-next-line no-nested-ternary
  process.env.POLL_DW !== undefined
    ? process.env.POLL_DW
    : config.pollDW !== undefined
    ? config.pollDW
    : 3; // in minutes, 0 => no poll
config.corsOrigin = config.corsOrigin || false;
config.ontologyName = process.env.ONTOLOGY_NAME || config.ontologyName || 'localhost';
// env variables comes as string if it is true or false we need to convert to boolean
if (process.env.CORS_ORIGIN) {
  if (process.env.CORS_ORIGIN === 'true') config.corsOrigin = true;
  else if (process.env.CORS_ORIGIN === 'false') config.corsOrigin = false;
  else config.corsOrigin = JSON.parse(process.env.CORS_ORIGIN);
}
config.noResume = process.env.NO_RESUME === 'true' || config.noResume || false;
config.secret = process.env.SECRET || config.secret || undefined;
module.exports = config;
