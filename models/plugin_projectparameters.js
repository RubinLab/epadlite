/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'plugin_projectparameters',
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
      name: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      format: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      prefix: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      inputBinding: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      default_value: {
        type: DataTypes.STRING(128),
        allowNull: true,
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
      type: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      description: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
    },
    {
      tableName: 'plugin_projectparameters',
    }
  );
};
