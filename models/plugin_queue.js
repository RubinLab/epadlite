/* jshint indent: 2 */
//  status values: waiting, running, ended,error, added, stopping
module.exports = function (sequelize, DataTypes) {
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
      project_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
        references: {
          model: 'project',
          key: 'id',
        },
      },
      plugin_parametertype: {
        type: DataTypes.STRING(10),
        allowNull: true,
        defaultValue: null,
      },
      aim_uid: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      runtime_params: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      max_memory: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
        defaultValue: null,
      },
      status: {
        type: DataTypes.STRING(8),
        allowNull: true,
        defaultValue: null,
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
