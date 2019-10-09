const chai = require('chai');

const chaiHttp = require('chai-http');

chai.use(chaiHttp);
const { expect } = chai;

let server;
before(async () => {
  process.env.host = '0.0.0.0';
  process.env.port = 5987;
  server = require('../server'); // eslint-disable-line
  await server.ready();
  await server.orm.authenticate();
});
after(() => {
  server.close();
});
describe('User Tests', () => {
  before(async () => {
    try {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'test1',
          projectName: 'test_user1',
          projectDescription: 'testdescUser',
          defaultTemplate: 'ROI',
          type: 'private',
          userName: 'admin',
        });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .post('/projects')
        .query({ username: 'admin' })
        .send({
          projectId: 'test2',
          projectName: 'test_user2',
          projectDescription: 'testdescUser',
          defaultTemplate: 'ROI',
          type: 'public',
          userName: 'admin',
        });
      // done();
    } catch (err) {
      // done(err);
      console.log(err);
    }
  });
  after(async () => {
    try {
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/test1')
        .query({ username: 'admin' });
      await chai
        .request(`http://${process.env.host}:${process.env.port}`)
        .delete('/projects/test2')
        .query({ username: 'admin' });
    } catch (err) {
      console.log(err);
    }
  });
  it('should have 1 user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        console.log(e);
        done();
      });
  });

  it('should create a new user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'test1@gmail.com',
        firstname: 'test',
        lastname: 'test',
        email: 'test1@gmail.com',
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should have 2 users as test1@gmail.com, without any projects linked', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(2);
        expect(res.body[1].username).to.be.eql('test1@gmail.com');
        expect(res.body[1].projects.length).to.be.eql(0);
        expect(res.body[1].projectToRole.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should create a new user with 2 projects linked', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .post('/users')
      .query({ username: 'admin' })
      .send({
        username: 'test2@gmail.com',
        firstname: 'test',
        lastname: 'test',
        email: 'test2@gmail.com',
        projects: [{ project: 'test1', role: 'Member' }, { project: 'test2', role: 'StudyOnly' }],
      })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should have 3 users as test1@gmail.com with 0 project and test2@gmail.com with 2 projects', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(3);
        expect(res.body[1].username).to.be.eql('test1@gmail.com');
        expect(res.body[1].projects.length).to.be.eql(0);
        expect(res.body[1].projectToRole.length).to.be.eql(0);
        expect(res.body[2].username).to.be.eql('test2@gmail.com');
        expect(res.body[2].projects.length).to.be.eql(2);
        expect(res.body[2].projectToRole.length).to.be.eql(2);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should return test1 user with 0 project and no permission', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users/test1@gmail.com')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.username).to.be.eql('test1@gmail.com');
        expect(res.body.projects.length).to.be.eql(0);
        expect(res.body.projectToRole.length).to.be.eql(0);
        expect(res.body.permissions).to.be.eql(['']);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should return test2 user with 2 project test1-owner and test2-member', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users/test2@gmail.com')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.username).to.be.eql('test2@gmail.com');
        expect(res.body.projects.length).to.be.eql(2);
        expect(res.body.projects).to.include('test1');
        expect(res.body.projects).to.include('test2');
        expect(res.body.projectToRole.length).to.be.eql(2);
        expect(res.body.projectToRole).to.include('test1:Member');
        expect(res.body.projectToRole).to.include('test2:StudyOnly');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should update user to have permissions', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/users/test2@gmail.com')
      .query({ username: 'admin' })
      .send({ permissions: 'CreateProject,CreateUser' })

      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should return test2 user with 2 permissions', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users/test2@gmail.com')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.username).to.be.eql('test2@gmail.com');
        expect(res.body.permissions.length).to.be.eql(2);
        expect(res.body.permissions).to.include('CreateProject');
        expect(res.body.permissions).to.include('CreateUser');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should return 404 for non existing user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users/test')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(404);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should add test1 user to project2 as Collaborator', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/test2/users/test1@gmail.com')
      .query({ username: 'admin' })
      .send({ updatedBy: 'admin', role: 'Collaborator' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should return test1 user with 1 project as test2-Collaborator', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(3);
        expect(res.body[1].username).to.be.eql('test1@gmail.com');
        expect(res.body[1].projects.length).to.be.eql(1);
        expect(res.body[1].projects).to.include('test2');
        expect(res.body[1].projectToRole.length).to.be.eql(1);
        expect(res.body[1].projectToRole).to.include('test2:Collaborator');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should update user as the owner of the project2', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/test2/users/test1@gmail.com')
      .query({ username: 'admin' })
      .send({ updatedBy: 'admin', role: 'Owner' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should return test1 user with 1 projects as test2-Owner', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(3);
        expect(res.body[1].username).to.be.eql('test1@gmail.com');
        expect(res.body[1].projects.length).to.be.eql(1);
        expect(res.body[1].projects).to.include('test2');
        expect(res.body[1].projectToRole.length).to.be.eql(1);
        expect(res.body[1].projectToRole).to.include('test2:Owner');
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should delete the relation of project1 if the role is none', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .put('/projects/test2/users/test1@gmail.com')
      .query({ username: 'admin' })
      .send({ updatedBy: 'admin', role: 'none' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should return test1 user with 0 project', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(3);
        expect(res.body[1].username).to.be.eql('test1@gmail.com');
        expect(res.body[1].projects.length).to.be.eql(0);
        expect(res.body[1].projectToRole.length).to.be.eql(0);
        done();
      })
      .catch(e => {
        done(e);
      });
  });

  it('should delete the user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/test1@gmail.com')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('should have 1 user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(2);
        expect(res.body[1].username).to.be.eql('test2@gmail.com');
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('should delete the user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .delete('/users/test2@gmail.com')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
  it('should have 0 user', done => {
    chai
      .request(`http://${process.env.host}:${process.env.port}`)
      .get('/users')
      .query({ username: 'admin' })
      .then(res => {
        expect(res.statusCode).to.equal(200);
        expect(res.body.length).to.be.eql(1);
        done();
      })
      .catch(e => {
        done(e);
      });
  });
});
