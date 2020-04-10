/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'plugin_queue',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      plugin_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
        references: {
          model: 'plugin',
          key: 'id',
        },
      },
      plugin_parametertype: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      aim_uid: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      container_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      container_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      max_memory: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
      },
      status: {
        type: DataTypes.INTEGER(1),
        allowNull: true,
      },
      creator: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      starttime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('current_timestamp'),
      },
      endtime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: '0000-00-00 00:00:00',
      },
    },
    {
      tableName: 'plugin_queue',
    }
  );
};
