/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'dbversion',
    {
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
