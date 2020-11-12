class DockerService {
  constructor(varFs, varFastify) {
    // eslint-disable-next-line global-require
    const Docker = require('dockerode');
    this.fs = varFs;
    this.fastify = varFastify;
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
              // eslint-disable-next-line func-names
              setTimeout(function() {
                container.inspect((cnterr, cntdata) => {
                  if (cntdata) {
                    resolve(data);
                  }
                  if (err) {
                    reject(cnterr);
                  }
                });
              }, 3000);
            })
          );
        }
      });
    });
  }

  stopContainer(containerId) {
    const tempFastify = this.fastify;
    return new Promise((resolve, reject) => {
      try {
        tempFastify.log.info('docker is working on stopping container', containerId);
        // eslint-disable-next-line func-names
        this.docker.getContainer(containerId).stop(() => {
          tempFastify.log.info('container stopped  : ', containerId);
          resolve('stopped');
        });
      } catch (err) {
        tempFastify.log.error('error happened while stopping container  : ', containerId);
        reject(err);
      }
    });
  }

  getContainerLog(containerId) {
    let tmpContainer;
    const tempFastify = this.fastify;
    return new Promise((resolve, reject) => {
      try {
        this.fastify.log.info('docker is working on getting log for container', containerId);
        // eslint-disable-next-line func-names
        tmpContainer = this.docker.getContainer(`epadplugin_${containerId}`);
        tempFastify.log.info('docker service getting log for ', `epadplugin_${containerId}`);
        // eslint-disable-next-line func-names
        tmpContainer.attach({ stream: true, stdout: true, stderr: true }, function(err, stream) {
          tempFastify.log.info('docker catched stream and resolving');
          if (err) {
            reject(err);
          }

          resolve(stream);
        });
      } catch (err) {
        tempFastify.log.error(
          'error happened while streaming the log  for the container with the id : ',
          containerId
        );
        reject(err);
      }
    });
  }

  inspectContainer(containerId) {
    // eslint-disable-next-line func-names
    // eslint-disable-next-line no-unused-vars
    return new Promise((resolve, reject) => {
      const containerTemp = this.docker.getContainer(containerId);
      // eslint-disable-next-line func-names
      containerTemp.inspect(function(err, data) {
        // this.fastify.log.info('container came back with inspection', data);
        if (err) {
          resolve('no container');
        }
        if (data) {
          resolve(data);
        }
        resolve('container inspection took too long');
      });
    });

    // query API for container info
    // eslint-disable-next-line func-names

    // return _this.dataObject;
  }

  createContainer(imageId, containerNameToGive, params, containerInfo, pluginDataRootPath) {
    const tempFastify = this.fastify;
    let tmpContainer;
    // eslint-disable-next-line prefer-destructuring
    const fs = this.fs;
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
          },
        })
        // eslint-disable-next-line func-names
        .then(function(container) {
          tempFastify.log.info('created container : ', container.id);
          tmpContainer = container;
          // eslint-disable-next-line func-names
          tmpContainer.inspect(function(err, data) {
            if (err) {
              //  this.fastify.log.info(err);
              tempFastify.log.info('error happened while inspecting plugin container : ', err);
              return err;
            }
            if (data) {
              tempFastify.log.info('inspect result for plugin container: ', data.Name);
              return data.Name;
            }
            return 0;
            // return 'container took too long to create';
          });
          return tmpContainer.start();
        })
        // eslint-disable-next-line func-names
        .then(async function() {
          const filename = `${pluginDataRootPath}/${tempContainerInfo.creator}/${
            tempContainerInfo.id
          }/logs`;
          tempFastify.log.info(
            'waiting for plugin to finish processing for container :',
            containerNameToGive
          );
          // eslint-disable-next-line func-names
          tmpContainer.attach({ stream: true, stdout: true, stderr: true }, function(err, stream) {
            const strm = fs.createWriteStream(`${filename}/logfile.txt`);
            stream.pipe(strm);
          });
          const runRes = await tmpContainer.wait();
          tempFastify.log.info('waiting result', runRes);
          return runRes.StatusCode;
        })
        // eslint-disable-next-line func-names
        .then(async function(errcode) {
          // errcode is recevied when container is terminated and exited with an error code > 0
          tempFastify.log.info(
            `${errcode} plugin container is done processing. Removing the container ${containerNameToGive}`
          );
          // // eslint-disable-next-line func-names
          const waitRes = await tmpContainer.remove();
          tempFastify.log.info(`wait response status ${waitRes}`);

          return waitRes;
        })
        // eslint-disable-next-line func-names
        .catch(function(err) {
          tempFastify.log.error('error in catch docker utils creating container phase: ', err);
          return err;
        })
    );
  }

  listContainers() {
    const contianerList = [];
    return this.docker
      .listContainers({ all: true })
      .then(containers => {
        // eslint-disable-next-line no-unused-vars
        containers.forEach(container => {
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
      .catch(error => {
        return new Error('Something went wrong while getting docker container list', error);
      });
  }

  listImages() {
    const tempFastify = this.fastify;
    const imageList = [];
    return this.docker
      .listImages({ all: true })
      .then(images => {
        images.forEach(image => {
          const imageObject = {
            id: image.Id,
            RepoTags: image.RepoTags,
          };
          imageList.push(imageObject);
        });
        return imageList;
      })
      .catch(error => {
        tempFastify.log.error('Something went wrong while getting docker image list');
        return new Error('Something went wrong while getting docker image list', error);
      });
  }

  //  does not follow image pulling process
  pullImage(img) {
    const tempFastify = this.fastify;
    return this.docker
      .pull(img)
      .then(() => {
        tempFastify.log.info('pulling image succeed : ', img);
      })
      .catch(() => {
        tempFastify.log.error('error happened while pulling the image', img);
      });
  }

  pullImageA(img) {
    const tempFastify = this.fastify;
    return new Promise((resolve, reject) => {
      try {
        // eslint-disable-next-line func-names
        this.docker.pull(img, function(err, stream) {
          if (err) {
            reject(err);
          } else {
            let counter = 0;
            const infoWord = ` image: ${img} pulling `;
            let showInfo = '';
            stream.on('data', () => {
              if (counter === 0) {
                process.stdout.write(`${infoWord}\r`);
                counter += 1;
              } else if (counter >= 1 && counter < 10) {
                // eslint-disable-next-line operator-assignment
                showInfo = `${showInfo}.`;
                // eslint-disable-next-line prefer-template
                process.stdout.write(infoWord + showInfo + '\r');
                //  process.stdout.write('\r');
                counter += 1;
              } else {
                counter = 0;
                // eslint-disable-next-line prettier/prettier
                process.stdout.write(
                  // eslint-disable-next-line prefer-template
                  infoWord + '               \r'
                );
                showInfo = '';
              }
            });
            stream.on('end', () => {
              tempFastify.log.info('pulling image succeed : ', img);
              resolve('finished pulling');
            });
          }
        });
      } catch (err) {
        resolve(err);
      }
    });
  }

  checkContainerExistance(containerName) {
    const tempFastify = this.fastify;
    return new Promise((resolve, reject) => {
      try {
        if (this.fs.existsSync('/var/run/docker.sock')) {
          tempFastify.log.error('var/run/docker.sock found');
        }
      } catch (err) {
        tempFastify.log.error('var/run/docker.sock not found. Check your docker installation');
        tempFastify.log.error(err);
      }
      const container = this.docker.getContainer(containerName);

      // eslint-disable-next-line prefer-destructuring
      // query API for container info
      // eslint-disable-next-line func-names
      container.inspect(function(err, data) {
        if (err) {
          //  this.fastify.log.info(err);
          tempFastify.log.error('error happened while checking container presence : ', err);
          reject(err);
        }
        if (data) {
          tempFastify.log.info('checking container presence succeed: ', containerName);
          resolve(data);
        }
      });
    });
  }

  deleteContainer(containerName) {
    const tempFastify = this.fastify;
    return new Promise((resolve, reject) => {
      try {
        const container = this.docker.getContainer(containerName);
        container.remove();
        tempFastify.log.info('deleting container succeed : ', containerName);
        resolve('success');
      } catch (err) {
        tempFastify.log.error('error happened while deleting container  : ', containerName);
        reject(err);
      }
    });
  }
}

module.exports = DockerService;
