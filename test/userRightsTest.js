const chai = require('chai');
const chaiHttp = require('chai-http');
const fs = require('fs');

chai.use(chaiHttp);
const { expect } = chai;
let server;
before(async () => {
  process.env.host = '0.0.0.0';
  process.env.port = 5987;
  server = require('../server'); // eslint-disable-line
  await server.ready();
});
after(() => {
  server.close();
});
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
        admin: true,
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
    await chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/testRights2/users/testCollaborator@gmail.com')
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
    it('should get 2 projects for testCollaborator user', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects')
        .query({ username: 'testCollaborator@gmail.com' })
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
  describe('Aim Access Tests', () => {
    before(async () => {
      // create aims for all 4 users
      try {
        const jsonBuffer = JSON.parse(fs.readFileSync('test/data/roi_sample_aim.json'));
        jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testAdmin@gmail.com';
        jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value = `testAdmin_${
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
        }`;
        jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
          '2.25.3526547897685764352413254324135453';
        await chai
          .request(`http://${process.env.host}:${process.env.port}`)
          .post('/projects/testRights1/aims')
          .send(jsonBuffer)
          .query({ username: 'testAdmin@gmail.com' });
        jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testOwner@gmail.com';
        jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value = `testOwner_${
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
        }`;
        jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
          '2.25.3526547897685764352413254324135454';
        await chai
          .request(`http://${process.env.host}:${process.env.port}`)
          .post('/projects/testRights1/aims')
          .send(jsonBuffer)
          .query({ username: 'testOwner@gmail.com' });

        jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testMember@gmail.com';
        jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value = `testMember_${
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
        }`;
        jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
          '2.25.3526547897685764352413254324135455';
        await chai
          .request(`http://${process.env.host}:${process.env.port}`)
          .post('/projects/testRights1/aims')
          .send(jsonBuffer)
          .query({ username: 'testMember@gmail.com' });

        jsonBuffer.ImageAnnotationCollection.user.loginName.value = 'testCollaborator@gmail.com';
        jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value = `testCollaborator_${
          jsonBuffer.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
        }`;
        jsonBuffer.ImageAnnotationCollection.uniqueIdentifier.root =
          '2.25.3526547897685764352413254324135456';
        await chai
          .request(`http://${process.env.host}:${process.env.port}`)
          .post('/projects/testRights1/aims')
          .send(jsonBuffer)
          .query({ username: 'testCollaborator@gmail.com' });
      } catch (err) {
        console.log(`Aim Access Tests setup error: ${err.message}`);
      }
    });
    after(async () => {});
    it('should get 4 aims for testAdmin user in testRights1 project', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims')
        .query({ username: 'testAdmin@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(4);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get 4 aims for testOwner user in testRights1 project', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims')
        .query({ username: 'testOwner@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(4);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get 4 aims for testMember user in testRights1 project', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims')
        .query({ username: 'testMember@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(res.body.length).to.be.eql(4);
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get 1 aims for testCollaborator user in testRights1 project', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims')
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
    it('should succeed in editing own aim for admin ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
        .query({ username: 'testAdmin@gmail.com' })
        .then(res => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'admin_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
            .query({ username: 'testAdmin@gmail.com' })
            .send(res.body)
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get own aim with new name for admin ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
        .query({ username: 'testAdmin@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('admin_edited');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed in editing testowner"s aim for admin ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
        .query({ username: 'testAdmin@gmail.com' })
        .then(res => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'admin_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
            .query({ username: 'testAdmin@gmail.com' })
            .send(res.body)
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get testowner"s aim with new name for admin ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135454')
        .query({ username: 'testAdmin@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('admin_edited');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed in editing testmember"s aim for admin ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
        .query({ username: 'testAdmin@gmail.com' })
        .then(res => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'admin_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
            .query({ username: 'testAdmin@gmail.com' })
            .send(res.body)
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get testmember"s aim with new name for admin ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135455')
        .query({ username: 'testAdmin@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('admin_edited');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should succeed in editing testcollaborator"s aim for admin ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
        .query({ username: 'testAdmin@gmail.com' })
        .then(res => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'admin_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
            .query({ username: 'testAdmin@gmail.com' })
            .send(res.body)
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get testcollaborator"s aim with new name for admin ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
        .query({ username: 'testAdmin@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('admin_edited');
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('should succeed in editing own aim for testcollaborator ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
        .query({ username: 'testCollaborator@gmail.com' })
        .then(res => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'collaborator_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
            .query({ username: 'testCollaborator@gmail.com' })
            .send(res.body)
            .then(resPut => {
              expect(resPut.statusCode).to.equal(200);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
    it('should get testcollaborator"s aim with new name for testCollaborator ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135456')
        .query({ username: 'testCollaborator@gmail.com' })
        .then(res => {
          expect(res.statusCode).to.equal(200);
          expect(
            res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value
          ).to.equal('collaborator_edited');
          done();
        })
        .catch(e => {
          done(e);
        });
    });
    it('should fail in editing testAdmin"s aim for testmember ', done => {
      chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .get('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
        .query({ username: 'testMember@gmail.com' })
        .then(res => {
          res.body.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].name.value =
            'owner_edited';
          chai
            .request(`http://${process.env.host}:${process.env.port}`)
            .put('/projects/testRights1/aims/2.25.3526547897685764352413254324135453')
            .query({ username: 'testMember@gmail.com' })
            .send(res.body)
            .then(resPut => {
              expect(resPut.statusCode).to.equal(401);
              done();
            })
            .catch(e => {
              done(e);
            });
        })
        .catch(e => {
          done(e);
        });
    });
  });
});
