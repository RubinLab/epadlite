/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'epadstatistics_monthly',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      numOfUsers: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      numOfProjects: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      numOfPatients: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      numOfStudies: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      numOfSeries: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      numOfAims: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      numOfDSOs: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      numOfWorkLists: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      numOfPacs: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      numOfAutoQueries: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      numOfFiles: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      numOfPlugins: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      numOfTemplates: {
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
    },
    {
      tableName: 'epadstatistics_monthly',
    }
  );
};
