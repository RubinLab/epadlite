/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'annotations',
    {
      UserLoginName: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      PatientID: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      SeriesUID: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      DSOSeriesUID: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      StudyUID: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      ImageUID: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      FrameID: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      AnnotationUID: {
        type: DataTypes.STRING(255),
        allowNull: false,
        primaryKey: true,
      },
      ProjectUID: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      XML: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      UPDATETIME: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('current_timestamp'),
      },
      DELETED: {
        type: DataTypes.INTEGER(1),
        allowNull: true,
      },
      DSOFRAMENO: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      TEMPLATECODE: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      SHAREDPROJECTS: {
        type: DataTypes.STRING(2000),
        allowNull: true,
      },
      NAME: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      AIMCOLOR: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      is_dicomsr: {
        type: DataTypes.INTEGER(1),
        allowNull: true,
      },
    },
    {
      tableName: 'annotations',
    }
  );
};
