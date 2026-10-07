const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { expect } = require('chai');
const { collectPluginAimFiles } = require('../utils/pluginAims');

describe('Plugin aim collection', () => {
  let root;

  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pluginaims-'));
    fs.outputJsonSync(path.join(root, 'output', 'case1', 'aim', 'a1.json'), {
      ImageAnnotationCollection: { uniqueIdentifier: { root: '1' } },
    });
    fs.outputJsonSync(path.join(root, 'output', 'case2', 'aim', 'a2.json'), {
      ImageAnnotationCollection: { uniqueIdentifier: { root: '2' } },
    });
    // not aims: another json, a broken json and a csv next to the aims
    fs.outputJsonSync(path.join(root, 'output', 'case1', 'other.json'), { something: 'else' });
    fs.outputFileSync(path.join(root, 'output', 'case1', 'broken.json'), '{not json');
    fs.outputFileSync(path.join(root, 'output', 'case1', 'findings.csv'), 'a,b\n1,2\n');
    fs.outputJsonSync(path.join(root, 'aims', 'input.json'), {
      ImageAnnotationCollection: { uniqueIdentifier: { root: '3' } },
    });
  });

  after(() => fs.removeSync(root));

  it('finds aims in output even when there are csv files', () => {
    const files = collectPluginAimFiles([path.join(root, 'output')]).map((f) => f.file);
    expect(files.sort()).to.eql(['a1.json', 'a2.json']);
  });

  it('ignores json files that are not aims', () => {
    const files = collectPluginAimFiles([path.join(root, 'output')]).map((f) => f.file);
    expect(files).to.not.include('other.json');
    expect(files).to.not.include('broken.json');
  });

  it('collects from the aims and output folders and skips missing folders', () => {
    const files = collectPluginAimFiles([
      path.join(root, 'aims'),
      path.join(root, 'nonexistent'),
      path.join(root, 'output'),
    ]).map((f) => f.file);
    expect(files.sort()).to.eql(['a1.json', 'a2.json', 'input.json']);
  });

  it('returns each file once and with its own folder', () => {
    const files = collectPluginAimFiles([path.join(root, 'output'), path.join(root, 'output')]);
    expect(files).to.have.length(2);
    const a2 = files.find((f) => f.file === 'a2.json');
    expect(a2.path).to.equal(path.join(root, 'output', 'case2', 'aim'));
  });
});
