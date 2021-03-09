/* eslint-disable no-underscore-dangle */
/* eslint-disable no-async-promise-executor */
const fp = require('fastify-plugin');

const { createTool, getMarkup } = require('aimapi');

// eslint-disable-next-line no-global-assign
window = {};
const dcmjs = require('dcmjs');

async function aimconvert(fastify) {
  fastify.decorate('generateMetadataProviderAndToolState', (aim) => {
    // get image ref
    const {
      imageStudy,
    } = aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].imageReferenceEntityCollection.ImageReferenceEntity[0];
    const studyInstanceUID = imageStudy.instanceUid.root;
    const seriesInstanceUID = imageStudy.imageSeries.instanceUid.root;

    const markupEntities =
      aim.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0].markupEntityCollection
        .MarkupEntity;
    const toolstate = {};
    // imageId is sopInstanceUID-frameNumber
    const imageIds = markupEntities.map((me) => {
      const { imageId, data } = getMarkup(me, aim);
      // const imageId = `${me.imageReferenceUid.root}-${me.referencedFrameNumber.value}`;
      const tool = createTool(data);
      console.log('tool', tool, 'markup', me);
      if (!toolstate[imageId]) toolstate[imageId] = {};
      if (!toolstate[imageId][tool.type]) toolstate[imageId][tool.type] = { data: [] };
      toolstate[imageId][tool.type].data.push(tool.data);
      return imageId;
    });

    return {
      metaDataProvider: {
        get(type, imageId) {
          if (type === 'generalSeriesModule') {
            if (imageIds.includes(imageId)) {
              return {
                studyInstanceUID,
                seriesInstanceUID,
              };
            }
          }
          if (type === 'sopCommonModule') {
            if (imageIds.includes(imageId)) {
              return {
                sopInstanceUID: imageId.split('&frame=')[0],
                sopClassUID: imageStudy.imageSeries.imageCollection.Image[0].sopClassUid.root, // assume all classuids are the same
              };
            }
          }
          if (type === 'frameNumber') {
            if (imageIds.includes(imageId)) {
              return imageId.split('&frame=')[1] ? imageId.split('&frame=')[1] : 1;
            }
          }
          return null;
        },
      },
      toolstate,
    };
  });

  fastify.decorate('aim2sr', (request, reply) => {
    try {
      const aim = request.body;
      // check if it has image
      // TODO how about study/series aims @Clunie

      const { toolstate, metaDataProvider } = fastify.generateMetadataProviderAndToolState(aim);
      const { MeasurementReport } = dcmjs.adapters.Cornerstone;

      const report = MeasurementReport.generateReport(toolstate, metaDataProvider);
      // console.log(report);
      // const reportBlob = dcmjs.data.datasetToBlob(report.dataset);
      const reportBuffer = dcmjs.data.datasetToBuffer(report.dataset);

      reply.send(reportBuffer);
    } catch (err) {
      console.log(err);
    }
    reply.send(null);
  });
}

// expose as plugin so the module using it can access the decorated methods
module.exports = fp(aimconvert);
