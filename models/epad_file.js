/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'epad_file',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      project_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
        references: {
          model: 'project',
          key: 'id',
        },
      },
      subject_uid: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      study_uid: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      series_uid: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      filepath: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
      filetype: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      mimetype: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      description: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
      length: {
        type: DataTypes.INTEGER(11),
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
      enabled: {
        type: DataTypes.INTEGER(1),
        allowNull: true,
      },
      templateleveltype: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
    },
    {
      tableName: 'epad_file',
    }
  );
};
