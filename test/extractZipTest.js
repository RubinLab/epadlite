const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const archiver = require('archiver');
const { expect } = require('chai');
const extractZip = require('../utils/extractZip');

// writes a zip with stored entries; unlike archiver it keeps names like ../evil.txt untouched
function writeRawZip(file, names) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  names.forEach((name) => {
    const data = Buffer.from('evil');
    const crc = zlib.crc32(data);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  });
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(file, Buffer.concat([...locals, centralBuf, end]));
}

function writeArchiverZip(file, fill) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip');
    const out = fs.createWriteStream(file);
    out.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(out);
    fill(archive);
    archive.finalize();
  });
}

describe('extractZip', () => {
  let tmp;
  let outDir;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'extractzip-'));
    outDir = path.join(tmp, 'out');
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('extracts files, nested folders and empty folders', async () => {
    const zip = path.join(tmp, 'ok.zip');
    await writeArchiverZip(zip, (a) => {
      a.append('one', { name: 'one.txt' });
      a.append('two', { name: 'sub/dir/two.txt' });
      a.append(Buffer.alloc(0), { name: 'emptydir/' });
    });
    await extractZip(zip, { dir: outDir });
    expect(fs.readFileSync(path.join(outDir, 'one.txt'), 'utf8')).to.equal('one');
    expect(fs.readFileSync(path.join(outDir, 'sub/dir/two.txt'), 'utf8')).to.equal('two');
    expect(fs.statSync(path.join(outDir, 'emptydir')).isDirectory()).to.equal(true);
  });

  it('extracts the aim zip fixture', async () => {
    await extractZip(path.join(__dirname, 'data/aims.zip'), { dir: outDir });
    expect(fs.readdirSync(outDir).filter((f) => f.endsWith('.json'))).to.have.lengthOf(2);
  });

  it('refuses entries that escape the target directory', async () => {
    const zip = path.join(tmp, 'traversal.zip');
    writeRawZip(zip, ['../evil.txt']);
    let error;
    try {
      await extractZip(zip, { dir: outDir });
    } catch (e) {
      error = e;
    }
    expect(error).to.be.an('error');
    expect(fs.existsSync(path.join(tmp, 'evil.txt'))).to.equal(false);
  });

  it('refuses symlink entries', async () => {
    const zip = path.join(tmp, 'symlink.zip');
    await writeArchiverZip(zip, (a) => {
      a.symlink('link', '/etc');
    });
    let error;
    try {
      await extractZip(zip, { dir: outDir });
    } catch (e) {
      error = e;
    }
    expect(error).to.be.an('error');
    expect(error.message).to.contain('symbolic link');
    expect(fs.existsSync(path.join(outDir, 'link'))).to.equal(false);
  });

  it('does not write through a symlink that already exists in the target', async () => {
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(outside);
    fs.mkdirSync(outDir);
    fs.symlinkSync(outside, path.join(outDir, 'sub'));
    const zip = path.join(tmp, 'through.zip');
    await writeArchiverZip(zip, (a) => {
      a.append('x', { name: 'sub/file.txt' });
    });
    let error;
    try {
      await extractZip(zip, { dir: outDir });
    } catch (e) {
      error = e;
    }
    expect(error).to.be.an('error');
    expect(fs.readdirSync(outside)).to.have.lengthOf(0);
  });

  it('rejects when the file is not a zip or does not exist', async () => {
    const notZip = path.join(tmp, 'not.zip');
    fs.writeFileSync(notZip, 'definitely not a zip');
    let error;
    try {
      await extractZip(notZip, { dir: outDir });
    } catch (e) {
      error = e;
    }
    expect(error).to.be.an('error');
    error = undefined;
    try {
      await extractZip(path.join(tmp, 'missing.zip'), { dir: outDir });
    } catch (e) {
      error = e;
    }
    expect(error).to.be.an('error');
  });
});
