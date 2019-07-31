/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('user', {
    id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING(128),
      allowNull: true,
      unique: true
    },
    firstname: {
      type: DataTypes.STRING(256),
      allowNull: true
    },
    lastname: {
      type: DataTypes.STRING(256),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(256),
      allowNull: true
    },
    password: {
      type: DataTypes.STRING(256),
      allowNull: true
    },
    permissions: {
      type: DataTypes.STRING(2000),
      allowNull: true
    },
    enabled: {
      type: DataTypes.INTEGER(1),
      allowNull: true
    },
    admin: {
      type: DataTypes.INTEGER(1),
      allowNull: true
    },
    passwordexpired: {
      type: DataTypes.INTEGER(1),
      allowNull: true
    },
    passwordupdate: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    lastlogin: {
      type: DataTypes.DATE,
      allowNull: true
    },
    creator: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    createdtime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: '0000-00-00 00:00:00'
    },
    updatetime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: '0000-00-00 00:00:00'
    },
    updated_by: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    colorpreference: {
      type: DataTypes.STRING(128),
      allowNull: true
    }
  }, {
    tableName: 'user'
  });
};
