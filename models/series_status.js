/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'series_status',
    {
      pk: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      series_iuid: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      status: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      created_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('current_timestamp'),
      },
      default_tags: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
    },
    {
      tableName: 'series_status',
    }
  );
};
