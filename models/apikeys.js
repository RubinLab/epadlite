/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'apikeys',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      appid: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },
      apikey: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      valid_ips: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
      creator: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      createdtime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatetime: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
    },
    {
      tableName: 'apikeys',
    }
  );
};
