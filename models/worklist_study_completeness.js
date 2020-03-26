/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'worklist_study_completeness',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      worklist_study_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        references: {
          model: 'worklist_study',
          key: 'id',
        },
      },
      assignee: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      worklist_requirement_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        references: {
          model: 'worklist_requirement',
          key: 'id',
        },
      },
      completeness: {
        type: DataTypes.INTEGER(10).UNSIGNED,
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
      tableName: 'worklist_study_completeness',
    }
  );
};
