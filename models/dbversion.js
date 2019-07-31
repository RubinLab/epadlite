/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('dbversion', {
    version: {
      type: DataTypes.STRING(6),
      allowNull: true
    }
  }, {
    tableName: 'dbversion'
  });
};
