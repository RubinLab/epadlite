# Dependency audit 1.9

`npm audit` went from 49 findings (5 critical, 27 high) to 10 (2 critical, 7 moderate, 1 low). Every change is its own commit on
`fix/audit1.9`; no `npm audit fix` was used. Test baseline before and after: 674 passing and the two
known failures (see below); the 6 tests of `extractZip` were added on top.

## Needs Node >= 20.19

`mocha` 12 and `jsdom` 28 need it. The Docker image is `node:20-bookworm-slim`, which satisfies it.

## Not tested by the automated tests

The test config uses `dicomweb_none`, no SMTP and no plugin containers, so these paths ran only
against local smoke scripts. Please check them on a real server (Stella dev):

- **DICOMweb through axios 0.21 -> 1.x**: opening a study in the viewer (QIDO/WADO-RS streams),
  creating a segmentation (STOW with dcmjs multipart), cache purge calls.
- **Plain DICOM upload to a PACS**: not tested on a real server. The automated tests only check
  the request shape with nock.
- **Plugin runs (dockerode 3 -> 5)**: start a plugin container, check its logs and the
  `annotations.zip` extraction of the plugin input.
- **Aim upload**: a single aim json (rewritten `saveAimFile`) and an aims zip (`saveFile` +
  `extractZip`).
- **Notification email** (`nodemailer` 6 -> 10 via an override), only when `notificationEmail` is
  configured.
- **Stats page / statistics sending**: the `host` value now includes the port again (`request.host`).
- CouchDB indexes are suspected to go stale intermittently. If a count or a list looks empty,
  reload before blaming a change. Nothing touching CouchDB (`nano`, `fastify-couchdb`) was changed.

## Behavior changes

- **fastify 4 -> 5** (with `@fastify/cors` 11, `multipart` 10, `static` 10, `swagger` 9,
  `fastify-plugin` 5):
  - `request.hostname` has no port any more. Download links and the statistics host use
    `request.host`.
  - Shorthand route schemas are wrapped by an `onRoute` hook in `server.js`.
  - Async plugins can't also take a `done` callback (`Ontology`, `EpadDB`).
  - `saveAimFile` uses `request.files()`, the callback `request.multipart` API is gone. An aim
    file with invalid JSON is now reported as a failed file instead of throwing in a stream callback.
- **`extract-zip` -> `utils/extractZip.js`** (yauzl): a zip containing a symlink entry now fails the
  upload. File permissions of the archive are no longer restored.
- `csv-parse` 7, `mariadb` 3, `axios` 1: same calls as before, no code changes needed.

## Overrides in package.json (JSON has no comments, so they are explained here)

| override | why |
| --- | --- |
| `dcmjs` -> `adm-zip` 0.6.1 | dcmjs 0.29 bundles a vulnerable adm-zip; the latest dcmjs needs Node 22 and still bundles a vulnerable one. epadlite does not use adm-zip itself. |
| `nodemailer` ^10.4.0 | `fastify-nodemailer` 5 depends on nodemailer 6. Only `createTransport`/`sendMail` are used. |
| `cmake-js` -> `tar` ^7.5.22, `axios` ^1.21.1 | build-time dependency of the optional `dicom-dimse-native`. |
| `glob@7`, `eslint`, `eslint-plugin-import`, `readdir-glob` -> `minimatch` ^3.1.5 | the 3.x line of minimatch has a ReDoS fix (3.1.4+) but these parents pin an older 3.x. Used by `archiver` (runtime, only for a hardcoded glob) and eslint. |
| `mocha` -> `glob` ^14.0.4, `minimatch` ^11.0.5 | mocha 12 pins glob 13 / minimatch 10, which are flagged; these are the patched versions `@fastify/static` already uses. Dev only. |

Remove an override once its parent package ships a fixed version.

## Still reported by `npm audit`

- `nano` / `request` / `qs` / `tough-cookie` / `uuid` / `form-data` / `cloudant-follow`, all via
  `fastify-couchdb`. Fixing it means replacing `nano`, whose newer versions drop the callback API
  used for CouchDB. Needs its own change.
- `sequelize` -> `uuid`, no fixed release. The advisory is about uuid v3/v5/v6 called with a buffer;
  sequelize only uses v1 and v4.
- `dcmjs`, low.

## Tests

- `npm test` runs the lint step now (prettier errors fixed). 84 lint warnings are older and untouched.
- Two tests fail, as before this work:
  - `csv upload should succeed`: `config/FacultySIDMapping.csv` is missing locally.
  - `Export Links ... should return 500 for an invalid aimuid`: the route returns 200 since
    42a5c3a ("guard AIM reads against errors"), the test was never updated.

## Local note: dicom-dimse-native

It is an optional dependency that can't be built without CMake. Docker (Linux x64) gets a prebuilt
binary. On macOS with a new Node, install the prebuilt one with
`cd node_modules/dicom-dimse-native && npx prebuild-install -r napi -t 4`.
