/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'registeredapps',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },
      organization: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },
      email: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },
      emailvalidationcode: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },
      apikey: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true,
      },
      ontologyname: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      hostname: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      epadtype: {
        type: DataTypes.STRING(1),
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
      emailvalidationsent: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'registeredapps',
    }
  );
};
