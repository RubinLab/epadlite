//const { Docker } = require('node-docker-api');
//const docker = new Docker({ socketPath: '/var/run/docker.sock' });

class DockerService {
  constructor() {
    const { Docker } = require('node-docker-api');
    this.promisifyStream = stream =>
      new Promise((resolve, reject) => {
        stream.on('data', d => console.log(d.toString()));
        stream.on('end', resolve);
        stream.on('error', reject);
      });
    //this.tar = require('tar-fs');
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

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
}

module.exports = DockerService;
