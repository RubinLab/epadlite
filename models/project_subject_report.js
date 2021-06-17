/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'project_subject_report',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      project_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        references: {
          model: 'project',
          key: 'id',
        },
        unique: 'compositeIndex',
      },
      subject_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        references: {
          model: 'subject',
          key: 'id',
        },
        unique: 'compositeIndex',
      },
      type: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: 'compositeIndex',
      },
      report: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      best_response_baseline: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      best_response_min: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      manual_edits: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
      // via automated process (aim save, delete), maybe we should notify user if he edited sth
      updated: {
        type: DataTypes.INTEGER(1),
        allowNull: true,
        defaultValue: false,
      },
      creator: {
        type: DataTypes.STRING(128),
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
      tableName: 'project_subject_report',
    }
  );
};
