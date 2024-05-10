/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'epadstatistics_usertf',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      host: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      template_code: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      user_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
      },
      num_of_tf: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
      },
      month: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
      },
      year: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
      },
      creator: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      createdtime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('current_timestamp'),
      },
      updatetime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: '0000-00-00 00:00:00',
      },
      updated_by: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
    },
    {
      tableName: 'epadstatistics_usertf',
    }
  );
};
