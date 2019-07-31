/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('coordinations', {
    coordination_key: {
      type: DataTypes.INTEGER(9),
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    coordination_id: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    schema_name: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    schema_version: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    description: {
      type: DataTypes.STRING(256),
      allowNull: true
    }
  }, {
    tableName: 'coordinations'
  });
};
