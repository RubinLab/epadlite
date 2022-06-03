/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'dbversion',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      version: {
        type: DataTypes.STRING(6),
        allowNull: true,
      },
      date: {
        type: DataTypes.DATE(3),
        allowNull: false,
      },
      branch: {
        type: DataTypes.STRING(40),
        allowNull: true,
      },
    },
    {
      tableName: 'dbversion',
    }
  );
};
