/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'worklist_requirement',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      worklist_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        references: {
          model: 'worklist',
          key: 'id',
        },
      },
      level: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      numOfAims: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
      },
      template: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      required: {
        type: DataTypes.INTEGER(1),
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
    },
    {
      tableName: 'worklist_requirement',
    }
  );
};
