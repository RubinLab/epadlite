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
  config.authConfig.clientSecret =
    process.env.AUTH_CLIENT_SECRET || config.authConfig.clientSecret || undefined;
  config.authConfig.enablePkce =
    (process.env.AUTH_PKCE && process.env.AUTH_PKCE === 'true') ||
    config.authConfig.enablePkce ||
    undefined;
  config.authConfig.legacyEndpoint =
    (process.env.LEGACY_ENDPOINT && process.env.LEGACY_ENDPOINT === 'true') ||
    config.authConfig.legacyEndpoint ||
    undefined;
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

config.dicomWebConfig.wadoSubPath =
  process.env.DICOMWEB_WADOSUBPATH || config.dicomWebConfig.wadoSubPath || '';

config.dicomWebConfig.qidoSubPath =
  process.env.DICOMWEB_QIDOSUBPATH || config.dicomWebConfig.qidoSubPath || '';

config.dicomWebConfig.username =
  process.env.DICOMWEB_USERNAME || config.dicomWebConfig.username || undefined;
config.dicomWebConfig.password =
  process.env.DICOMWEB_PASSWORD || config.dicomWebConfig.password || undefined;

config.dicomWebConfig.legacyEndpoint =
  (process.env.DICOMWEB_LEGACY_ENDPOINT && process.env.DICOMWEB_LEGACY_ENDPOINT === 'true') ||
  config.dicomWebConfig.legacyEndpoint ||
  undefined;

config.dicomWebConfig.requireHeaders =
  (process.env.DICOMWEB_REQUIRE_HEADERS && process.env.DICOMWEB_REQUIRE_HEADERS === 'true') ||
  config.dicomWebConfig.requireHeaders ||
  undefined;

config.dicomWebConfig.requireJSONHeader =
  (process.env.DICOMWEB_REQUIRE_JSON_HEADER &&
    process.env.DICOMWEB_REQUIRE_JSON_HEADER === 'true') ||
  config.dicomWebConfig.requireJSONHeader ||
  undefined;

// eslint-disable-next-line no-nested-ternary
config.archiveDicomWebConfig = config.archiveDicomWebConfig
  ? config.archiveDicomWebConfig
  : process.env.VNA_DICOMWEB_BASEURL || process.env.ARCHIVE_DICOMWEB_BASEURL
  ? {
      baseUrl: process.env.VNA_DICOMWEB_BASEURL || process.env.ARCHIVE_DICOMWEB_BASEURL,
      wadoSubPath: process.env.VNA_DICOMWEB_WADOSUBPATH || process.env.ARCHIVE_DICOMWEB_WADOSUBPATH,
      qidoSubPath: process.env.VNA_DICOMWEB_QIDOSUBPATH || process.env.ARCHIVE_DICOMWEB_QIDOSUBPATH,
      username: process.env.VNA_DICOMWEB_USERNAME || process.env.ARCHIVE_DICOMWEB_USERNAME,
      password: process.env.VNA_DICOMWEB_PASSWORD || process.env.ARCHIVE_DICOMWEB_PASSWORD,
      legacyEndpoint:
        (process.env.VNA_DICOMWEB_LEGACY_ENDPOINT &&
          process.env.VNA_DICOMWEB_LEGACY_ENDPOINT === 'true') ||
        (process.env.ARCHIVE_DICOMWEB_LEGACY_ENDPOINT &&
          process.env.ARCHIVE_DICOMWEB_LEGACY_ENDPOINT === 'true'),
      requireHeaders:
        (process.env.VNA_DICOMWEB_REQUIRE_HEADERS &&
          process.env.VNA_DICOMWEB_REQUIRE_HEADERS === 'true') ||
        (process.env.ARCHIVE_DICOMWEB_REQUIRE_HEADERS &&
          process.env.ARCHIVE_DICOMWEB_REQUIRE_HEADERS === 'true'),
      requireJSONHeader:
        (process.env.VNA_DICOMWEB_REQUIRE_JSON_HEADER &&
          process.env.VNA_DICOMWEB_REQUIRE_JSON_HEADER === 'true') ||
        (process.env.ARCHIVE_DICOMWEB_REQUIRE_JSON_HEADER &&
          process.env.ARCHIVE_DICOMWEB_REQUIRE_JSON_HEADER === 'true'),
    }
  : null;

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
config.disableDICOMSend = process.env.DISABLE_DICOM_SEND === 'true' || config.disableDICOMSend;
config.unassignedProjectID = config.unassignedProjectID || 'nonassigned';
config.XNATUploadProjectID = config.XNATUploadProjectID || 'all';
config.pollDW =
  // eslint-disable-next-line no-nested-ternary
  process.env.POLL_DW !== undefined
    ? Number.parseInt(process.env.POLL_DW, 10)
    : config.pollDW !== undefined
    ? config.pollDW
    : 3; // in minutes, 0 => no poll
config.corsOrigin = config.corsOrigin || false;
config.ontologyName = process.env.ONTOLOGY_NAME || config.ontologyName || 'local';
config.ontologyApiKey = process.env.ONTOLOGY_APIKEY || config.ontologyApiKey || 'local';
// env variables comes as string if it is true or false we need to convert to boolean
if (process.env.CORS_ORIGIN) {
  if (process.env.CORS_ORIGIN === 'true') config.corsOrigin = true;
  else if (process.env.CORS_ORIGIN === 'false') config.corsOrigin = false;
  else config.corsOrigin = JSON.parse(process.env.CORS_ORIGIN);
}
config.noResume = process.env.NO_RESUME === 'true' || config.noResume || false;
config.secret = process.env.SECRET || config.secret || undefined;
config.precomputeReports = process.env.PRECOMPUTE_REPORTS
  ? JSON.parse(process.env.PRECOMPUTE_REPORTS)
  : config.precomputeReports || [];
config.wadoType = process.env.WADO_TYPE || config.wadoType || undefined;
config.auditLog =
  (process.env.AUDIT_LOG && process.env.AUDIT_LOG === 'true') || config.auditLog || false;
// eslint-disable-next-line no-nested-ternary
config.dimse = config.dimse
  ? config.dimse
  : process.env.DIMSE_AET
  ? {
      aet: process.env.DIMSE_AET,
      ip: process.env.DIMSE_IP,
      port: process.env.DIMSE_PORT,
      sourceIp: process.env.DIMSE_SOURCE_IP,
    }
  : null;
// eslint-disable-next-line no-nested-ternary
config.archiveDimse = config.archiveDimse
  ? config.archiveDimse
  : process.env.VNA_DIMSE_AET || process.env.ARCHIVE_DIMSE_AET
  ? {
      aet: process.env.VNA_DIMSE_AET || process.env.ARCHIVE_DIMSE_AET,
      ip: process.env.VNA_DIMSE_IP || process.env.ARCHIVE_DIMSE_IP,
      port: process.env.VNA_DIMSE_PORT || process.env.ARCHIVE_DIMSE_PORT,
      sourceIp: process.env.VNA_DIMSE_SOURCE_IP || process.env.ARCHIVE_DIMSE_SOURCE_IP,
    }
  : null;
config.pullStudyIds =
  (process.env.PULL_STUDY_IDS && process.env.PULL_STUDY_IDS === 'true') ||
  config.pullStudyIds ||
  false;

// eslint-disable-next-line no-nested-ternary
config.ad = config.ad
  ? config.ad
  : process.env.AD_URL
  ? {
      url: process.env.AD_URL,
      baseDN: process.env.AD_BASEDN,
      username: process.env.AD_USERNAME,
      password: process.env.AD_PASSWORD,
    }
  : null;

config.defaultTemplate = process.env.DEFAULT_TEMPLATE || config.defaultTemplate || 'ROI';
config.teachingTemplate = process.env.TEACHING_TEMPLATE || config.teachingTemplate || '99EPAD_947';
config.sigImageTemplate = process.env.SIG_IMAGE_TEMPLATE || config.sigImageTemplate || '99EPAD_948';

config.teachingTemplateUID =
  process.env.TEACHING_TEMPLATE_UID ||
  config.teachingTemplateUID ||
  '2.25.182468981370271895711046628549377576999';
config.projOnTop = process.env.PROJ_ON_TOP || config.projOnTop || undefined;
config.versionAudit =
  (process.env.VERSION_AUDIT && process.env.VERSION_AUDIT === 'true') ||
  config.versionAudit ||
  false;

config.deleteNoAimStudy =
  (process.env.DELETE_NO_AIM_STUDY && process.env.DELETE_NO_AIM_STUDY === 'true') ||
  config.deleteNoAimStudy ||
  false;

config.trustPath = process.env.TRUST_PATH || config.trustPath || undefined;

// use rrMin for response category and bestresponse for waterfall
// this is just for being able to set bestResponse and RCFromRRMin together (overrides them)
config.legacyReporting =
  (process.env.LEGACY_REPORTING && process.env.LEGACY_REPORTING === 'true') ||
  config.legacyReporting ||
  false;

// the default is the last response starting version 1.0.0
config.bestResponse =
  (process.env.BEST_RESPONSE && process.env.BEST_RESPONSE === 'true') ||
  config.bestResponse ||
  config.legacyReporting ||
  false;

// default is using RR baseline for response categories starting from 1.0.0
config.RCFromRRMin =
  (process.env.RC_FROM_RR_MIN && process.env.RC_FROM_RR_MIN === 'true') ||
  config.RCFromRRMin ||
  config.legacyReporting ||
  false;

config.https = (process.env.HTTPS && process.env.HTTPS === 'true') || config.https || false;

module.exports = config;
