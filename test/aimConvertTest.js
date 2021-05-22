const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs');

chai.use(chaiHttp);
const { expect } = chai;

describe.only('Aim Convert Tests', () => {
  it('should convert aim to dicomsr ', (done) => {
    const jsonBuffer = JSON.parse(fs.readFileSync('test/data/bidirectional_recist.json'));
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put(`/aim2dicomsr`)
      .send(jsonBuffer)
      .query({ username: 'admin' })
      .then((res) => {
        fs.writeFileSync('file.dcm', Buffer.from(res.body));
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
  it('should convert dicomsr to aim', (done) => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put(`/dicomsr2aim`)
      .attach('files', 'test/data/sr/bidirectional_sr.dcm', 'bidirectional_sr.dcm')
      .query({ username: 'admin' })
      .then((res) => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch((e) => {
        done(e);
      });
  });
});
