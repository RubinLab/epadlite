/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'eventlog',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      projectID: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      subjectuid: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      studyUID: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      seriesUID: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      imageUID: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      aimID: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      username: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      function: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      params: {
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
      filename: {
        type: DataTypes.STRING(250),
        allowNull: true,
      },
      error: {
        type: DataTypes.INTEGER(1),
        allowNull: true,
      },
      notified: {
        type: DataTypes.INTEGER(1),
        allowNull: true,
      },
    },
    {
      tableName: 'eventlog',
    }
  );
};
