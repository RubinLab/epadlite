/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'remote_pac_query',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      pacid: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      requestor: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      subject_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
        references: {
          model: 'subject',
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
      modality: {
        type: DataTypes.STRING(8),
        allowNull: true,
      },
      period: {
        type: DataTypes.STRING(8),
        allowNull: true,
      },
      laststudydate: {
        type: DataTypes.STRING(8),
        allowNull: true,
      },
      enabled: {
        type: DataTypes.INTEGER(1),
        allowNull: true,
      },
      lastquerytime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('current_timestamp'),
      },
      lastquerystatus: {
        type: DataTypes.STRING(1024),
        allowNull: true,
      },
      createdtime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: '0000-00-00 00:00:00',
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
      tableName: 'remote_pac_query',
    }
  );
};
