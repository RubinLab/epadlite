class DockerService {
  constructor(prmFs, prmFastify, prmPath) {
    // eslint-disable-next-line global-require
    const Docker = require('dockerode');
    this.path = prmPath;
    this.fs = prmFs;
    this.fastify = prmFastify;
    this.counter = 0;
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  // eslint-disable-next-line no-unused-vars
  startContainer(containerId, _containerName) {
    //  this.fastify.log.info('container started dockerode');
    const container = this.docker.getContainer(containerId);
    return new Promise((resolve, reject) => {
      container.start((err, data) => {
        //  this.fastify.log.info('starting container ......');
        if (err) {
          reject(err);
        }
        if (data) {
          resolve(
            // eslint-disable-next-line no-shadow
            new Promise((resolve, reject) => {
              // eslint-disable-next-line prefer-arrow-callback
              setTimeout(function () {
                container.inspect((cnterr, cntdata) => {
                  if (cntdata) {
                    resolve(data);
                  }
                  if (err) {
                    reject(cnterr);
                  }
                });
              }, 3000);
            }).catch((erra) => erra)
          );
        }
      });
    });
  }

  stopContainer(containerId) {
    const tempFastify = this.fastify;
    return new Promise((resolve, reject) => {
      try {
        tempFastify.log.info(`docker is working on stopping container : ${containerId}`);
        // eslint-disable-next-line prefer-arrow-callback
        this.docker.getContainer(containerId).stop(() => {
          tempFastify.log.info(`container stopped  : ${containerId}`);
          resolve('stopped');
        });
      } catch (err) {
        tempFastify.log.error(`error happened while stopping container  : ${containerId}`);
        reject(err);
      }
    }).catch((err) => err);
  }

  getContainerLog(containerId) {
    let tmpContainer;
    const tempFastify = this.fastify;
    return new Promise((resolve, reject) => {
      try {
        this.fastify.log.info(`docker is working on getting log for container :${containerId}`);
        // eslint-disable-next-line prefer-arrow-callback
        tmpContainer = this.docker.getContainer(`epadplugin_${containerId}`);
        tempFastify.log.info(`docker service getting log for epadplugin_${containerId}`);
        // eslint-disable-next-line prefer-arrow-callback
        tmpContainer.attach({ stream: true, stdout: true, stderr: true }, function (err, stream) {
          tempFastify.log.info('docker catched stream and resolving');
          if (err) {
            reject(err);
          }

          resolve(stream);
        });
      } catch (err) {
        tempFastify.log.error(
          `error happened while streaming the log  for the container with the id : ${containerId}`
        );
        reject(err);
      }
    }).catch((err) => err);
  }

  inspectContainer(containerId) {
    // eslint-disable-next-line prefer-arrow-callback
    // eslint-disable-next-line no-unused-vars
    return new Promise((resolve, reject) => {
      const containerTemp = this.docker.getContainer(containerId);
      // eslint-disable-next-line prefer-arrow-callback
      containerTemp.inspect(function (err, data) {
        // this.fastify.log.info('container came back with inspection', data);
        if (err) {
          resolve('no container');
        }
        if (data) {
          resolve(data);
        }
        resolve('container inspection took too long');
      });
    }).catch((err) => err);

    // query API for container info
  }

  createContainer(imageId, containerNameToGive, params, containerInfo) {
    const tempFastify = this.fastify;
    let tmpContainer;
    const { path } = this;
    const { fs } = this;
    const tempContainerInfo = containerInfo;
    const paramsDocker = [...params.paramsDocker];
    const dockerFoldersToBind = [...params.dockerFoldersToBind];

    return (
      this.docker
        .createContainer({
          Image: imageId,
          name: containerNameToGive,
          AttachStdin: false,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Cmd: paramsDocker,
          OpenStdin: false,
          StdinOnce: false,
          HostConfig: {
            Binds: dockerFoldersToBind,
            DeviceRequests: [...params.dockeroptions.HostConfig.DeviceRequests],
            ShmSize: parseInt(params.dockeroptions.HostConfig.ShmSize, 10) || 64000000,
          },
        })
        // eslint-disable-next-line prefer-arrow-callback
        .then(function (container) {
          tempFastify.log.info(`created container : ${container.id}`);
          tmpContainer = container;
          // eslint-disable-next-line prefer-arrow-callback
          tmpContainer.inspect(function (err, data) {
            if (err) {
              //  this.fastify.log.info(err);
              tempFastify.log.info(`error happened while inspecting plugin container : ${err}`);
              return err;
            }
            if (data) {
              tempFastify.log.info(`inspect result for plugin container: ${JSON.stringify(data)}`);
              return data;
            }
            // return 'container took too long to create';
            return 0;
          });
          return tmpContainer.start();
        })
        // eslint-disable-next-line prefer-arrow-callback
        .then(async function () {
          const tempPluginDataRootPath = path.join(__dirname, `../pluginsDataFolder`);
          const filename = `${tempPluginDataRootPath}/${tempContainerInfo.creator}/${tempContainerInfo.id}/logs`;
          tempFastify.log.info(
            `waiting for plugin to finish processing for container : ${containerNameToGive}`
          );
          // eslint-disable-next-line prefer-arrow-callback
          tmpContainer.attach({ stream: true, stdout: true, stderr: true }, function (err, stream) {
            const strm = fs.createWriteStream(`${filename}/logfile.txt`);
            stream.pipe(strm);
          });
          const runRes = await tmpContainer.wait();
          tempFastify.log.info(`waiting result : ${JSON.stringify(runRes)}`);
          return runRes.StatusCode;
        })
        // eslint-disable-next-line prefer-arrow-callback
        .then(async function (errcode) {
          // errcode is recevied when container is terminated and exited with an error code > 0
          tempFastify.log.info(
            `${errcode} plugin container is done processing. Removing the container ${containerNameToGive}`
          );
          // // eslint-disable-next-line prefer-arrow-callback
          const waitRes = await tmpContainer.remove();
          tempFastify.log.info(`plugin is removing the container : ${waitRes}`);

          return waitRes;
        })
        // eslint-disable-next-line prefer-arrow-callback
        .catch(function (err) {
          tempFastify.log.error(`error in catch docker utils creating container phase: ${err}`);
          return err;
        })
    );
  }

  listContainers() {
    const contianerList = [];
    return this.docker
      .listContainers({ all: true })
      .then((containers) => {
        // eslint-disable-next-line no-unused-vars
        containers.forEach((container) => {
          const contObj = {
            id: container.Id,
            names: container.Names,
            state: container.State,
            status: container.Status,
            mounts: container.Mount,
          };
          contianerList.push(contObj);
        });
        return contianerList;
      })
      .catch(
        (error) => new Error('Something went wrong while getting docker container list', error)
      );
  }

  listImages() {
    const tempFastify = this.fastify;
    const imageList = [];
    return this.docker
      .listImages({ all: true })
      .then((images) => {
        images.forEach((image) => {
          const imageObject = {
            id: image.Id,
            RepoTags: image.RepoTags,
          };
          imageList.push(imageObject);
        });
        return imageList;
      })
      .catch((error) => {
        tempFastify.log.error(`Something went wrong while getting docker image list , ${error}`);
        return new Error('Something went wrong while getting docker image list', error);
      });
  }

  //  does not follow image pulling process
  pullImage(img) {
    const tempFastify = this.fastify;
    return this.docker
      .pull(img)
      .then(() => {
        tempFastify.log.info(`pulling image succeed : ${img}`);
      })
      .catch(() => {
        tempFastify.log.error(`error happened while pulling the image ${img}`);
      });
  }

  pullImageA(img) {
    const tempFastify = this.fastify;
    return new Promise((resolve, reject) => {
      try {
        // eslint-disable-next-line prefer-arrow-callback
        this.docker.pull(img, function (err, stream) {
          if (err) {
            reject(err);
          } else {
            let counter = 0;
            const infoWord = ` image: ${img} pulling `;
            stream.on('data', () => {
              if (counter === 0) {
                process.stdout.write(`${infoWord}\r`);
                counter += 1;
              }
            });
            stream.on('end', () => {
              tempFastify.log.info(`pulling image succeed : ${img}`);
              resolve('finished pulling');
            });
          }
        });
      } catch (err) {
        resolve(err);
      }
    }).catch((err) => err);
  }

  checkContainerExistance(containerName) {
    const tempFastify = this.fastify;
    return new Promise((resolve, reject) => {
      try {
        if (this.fs.existsSync('/var/run/docker.sock')) {
          tempFastify.log.info('var/run/docker.sock found');
        }
      } catch (err) {
        tempFastify.log.error('var/run/docker.sock not found. Check your docker installation');
        tempFastify.log.error(err);
      }

      const container = this.docker.getContainer(containerName);

      // eslint-disable-next-line prefer-destructuring
      // query API for container info
      // eslint-disable-next-line prefer-arrow-callback
      return container.inspect(function (err, data) {
        if (err) {
          tempFastify.log.error(`error happened while checking container presence : ${err}`);
          reject(new Error(404));
        }
        if (data) {
          tempFastify.log.info(`checking container presence succeed: ${containerName}`);
          resolve(data);
        }
      });
    }).catch((err) => err);
  }

  deleteContainer(containerName) {
    const tempFastify = this.fastify;
    return new Promise((resolve, reject) => {
      try {
        const container = this.docker.getContainer(containerName);
        container.remove();
        tempFastify.log.info(`deleting container succeed : ${containerName}`);
        resolve('success');
      } catch (err) {
        tempFastify.log.error(`error happened while deleting container  : ${containerName}`);
        reject(err);
      }
    }).catch((err) => err);
  }
}

module.exports = DockerService;
