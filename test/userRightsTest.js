const chai = require('chai');

const chaiHttp = require('chai-http');

chai.use(chaiHttp);
const { expect } = chai;

describe('User Rights Tests', () => {
  before(async () => {
    // create users
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'testAdmin@gmail.com',
        firstname: 'testAdmin',
        lastname: 'testAdmin',
        email: 'testAdmin@gmail.com',
      });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'testOwner@gmail.com',
        firstname: 'testOwner',
        lastname: 'testOwner',
        email: 'testOwner@gmail.com',
        permissions: 'CreateProject',
      });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'testMember@gmail.com',
        firstname: 'testMember',
        lastname: 'testMember',
        email: 'testMember@gmail.com',
      });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'testCollaborator@gmail.com',
        firstname: 'testCollaborator',
        lastname: 'testCollaborator',
        email: 'testCollaborator@gmail.com',
      });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'testCreator@gmail.com',
        firstname: 'testCreator',
        lastname: 'testCreator',
        email: 'testCreator@gmail.com',
      });
    // create project
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects')
      .query({ username: 'admin' })
      .send({
        projectId: 'testRights1',
        projectName: 'testRights1',
        projectDescription: 'testRights1',
        defaultTemplate: 'ROI',
        type: 'private',
        userName: 'admin',
      });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/projects')
      .query({ username: 'admin' })
      .send({
        projectId: 'testRights2',
        projectName: 'testRights2',
        projectDescription: 'testRights2',
        defaultTemplate: 'ROI',
        type: 'private',
        userName: 'admin',
      });
    // define user access to project
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/testRights1/users/testOwner@gmail.com')
      .query({ username: 'admin' })
      .send({ updatedBy: 'admin', role: 'Owner' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/testRights1/users/testMember@gmail.com')
      .query({ username: 'admin' })
      .send({ updatedBy: 'admin', role: 'Member' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/testRights1/users/testCollaborator@gmail.com')
      .query({ username: 'admin' })
      .send({ updatedBy: 'admin', role: 'Collaborator' });
  });
  after(async () => {
    // delete projects
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/projects/testRights1')
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/projects/testRights2')
      .query({ username: 'admin' });
    // delete users
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testAdmin@gmail.com')
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testOwner@gmail.com')
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testMember@gmail.com')
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testCollaborator@gmail.com')
      .query({ username: 'admin' });
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/testCreator@gmail.com')
      .query({ username: 'admin' });
  });
  describe('Project Access Tests', () => {
    it('should get 2 projects for testAdmin user', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects')
        .query({ username: 'testAdmin@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(2);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get 1 project for testOwner user', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects')
        .query({ username: 'testOwner@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get 1 project for testMember user', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects')
        .query({ username: 'testMember@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get 1 project for testCollaborator user', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects')
        .query({ username: 'testCollaborator@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(1);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should successfully create a new project with testOwner user', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'testOwner@gmail.com' })
        .send({
          projectId: 'testRights3',
          projectName: 'testRights3',
          projectDescription: 'testRights3',
          defaultTemplate: 'ROI',
          type: 'private',
          userName: 'testOwner@gmail.com',
        })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail creating a new project with testMember user', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'testMember@gmail.com' })
        .send({
          projectId: 'testRights4',
          projectName: 'testRights4',
          projectDescription: 'testRights4',
          defaultTemplate: 'ROI',
          type: 'private',
          userName: 'testMember@gmail.com',
        })
        .then(res => {
          expect(res.statusCode).to.equal(401);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail deleting testRights3 project with testMember user', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testRights3')
        .query({ username: 'testMember@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(401);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should successfully delete testRights3 project with testOwner user', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/testRights3')
        .query({ username: 'testOwner@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
  });
});
