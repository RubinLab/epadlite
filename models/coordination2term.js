/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'coordination2term',
    {
      coordination_key: {
        type: DataTypes.INTEGER(9),
        allowNull: true,
      },
      term_key: {
        type: DataTypes.INTEGER(9),
        allowNull: true,
      },
      position: {
        type: DataTypes.INTEGER(9),
        allowNull: true,
      },
    },
    {
      tableName: 'coordination2term',
    }
  );
};
