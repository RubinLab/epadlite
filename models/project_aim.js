/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'project_aim',
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
      aim_uid: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      user: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      template: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      subject_uid: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      study_uid: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      series_uid: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      image_uid: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      frame_id: {
        type: DataTypes.STRING(5),
        allowNull: true,
      },
      dso_series_uid: {
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
    },
    {
      tableName: 'project_aim',
    }
  );
};
