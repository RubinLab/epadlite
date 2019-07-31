/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('epadstatistics_template', {
    id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    host: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    templateLevelType: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    templateName: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    authors: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    version: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    templateDescription: {
      type: DataTypes.STRING(256),
      allowNull: true
    },
    templateType: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    templateCode: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    numOfAims: {
      type: DataTypes.INTEGER(11),
      allowNull: true
    },
    templateText: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    creator: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    createdtime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.fn('current_timestamp')
    },
    updatetime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: '0000-00-00 00:00:00'
    },
    updated_by: {
      type: DataTypes.STRING(64),
      allowNull: true
    }
  }, {
    tableName: 'epadstatistics_template'
  });
};
