/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'study',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      studyuid: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true,
      },
      studydate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      subject_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
        references: {
          model: 'subject',
          key: 'id',
        },
      },
      exam_types: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      creator: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      createdtime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('current_timestamp'),
      },
      updatetime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: '0000-00-00 00:00:00',
      },
      updated_by: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      description: {
        type: DataTypes.STRING(1000),
        allowNull: true,
      },
      referring_physician: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      accession_number: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      num_of_images: {
        type: DataTypes.INTEGER(10),
        allowNull: true,
      },
      num_of_series: {
        type: DataTypes.INTEGER(10),
        allowNull: true,
      },
      study_id: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      study_time: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
    },
    {
      tableName: 'study',
    }
  );
};
