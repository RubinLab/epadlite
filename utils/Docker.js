//const { Docker } = require('node-docker-api');
//const docker = new Docker({ socketPath: '/var/run/docker.sock' });

class DockerService {
  constructor() {
    const Docker = require('dockerode');

    //this.tar = require('tar-fs');
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }
  startContainer(containerId, containerName) {
    console.log('container started dockerode');
    const container = this.docker.getContainer(containerId);
    return new Promise((resolve, reject) => {
      container.start((err, data) => {
        console.log('starting container ......');
        if (err) {
          reject(err);
        }
        if (data) {
          console.log('we call inspect promise');
          resolve(
            new Promise((resolve, reject) => {
              setTimeout(function() {
                container.inspect((err, data) => {
                  if (data) {
                    resolve(data);
                  }
                  if (err) {
                    reject(err);
                  }
                });
              }, 3000);
            })
          );
        }
      });
    });
    /*
    container.start(
      function(err, data) {
        console.log('------------ start :', data);
      },
      () => {
        container.inspect(function(err, data) {
          console.log('------------- inspect : ', data.State.Status);
        });
      }
    );
    */
  }

  createContainer(imageId, containerNameToGive) {
    let auxContainer;
    return this.docker
      .createContainer({
        Image: imageId,
        name: containerNameToGive,
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        //Cmd: ['/bin/bash', '-c', 'tail -f /var/log/dmesg'],
        OpenStdin: false,
        StdinOnce: false,
        HostConfig: {
          Binds: ['/Users/cavit/epadlitev1/distribution/ePad/exampleContaienr/sharewcont:/stuff'],
        },
      })
      .then(function(container) {
        auxContainer = container;
        return auxContainer.start();
      })
      .catch(function(err) {
        console.log(err);
      });
  }

  /*
  createContainer(containerImage, containerName) {
    this.docker.container
      .create({
        Image: containerImage,
        name: containerName,
      })
      .then(container => container.start())
      .then(console.log('container started'))
      // .then(container => container.stop())
      // .then(container => container.restart())
      // .then(container => container.delete({ force: true }))
      .catch(error => console.log(error));
  }

  startContainer(containerId, containerName) {}

  stopContainer(containerId, containerName) {}
  deleteContainer() {}

  listContainers() {
    this.docker.container
      .list()
      // Inspect
      .then(containers => {
        containers.forEach(container => {
          console.log(container.data.Image);
        });
      })
      .catch(error => console.log(error));
  }
  pullImage(imagerepository, imagetag) {
    this.docker.image
      .create({}, { fromImage: imagerepository, tag: imagetag })
      .then(stream => this.promisifyStream(stream))
      .then(() => this.docker.image.get(imageLocation).status())
      .then(image => image.history())
      .then(events => console.log(events))
      .catch(error => console.log(error));
  }

  listImages() {}
  deleteImage() {}
*/
}

module.exports = DockerService;
