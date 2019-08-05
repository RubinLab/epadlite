/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'worklist',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      worklistid: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true,
      },
      description: {
        type: DataTypes.STRING(1000),
        allowNull: true,
      },
      user_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
        references: {
          model: 'user',
          key: 'id',
        },
      },
      status: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
      startdate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      completedate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      duedate: {
        type: DataTypes.DATEONLY,
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
      name: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
    },
    {
      tableName: 'worklist',
    }
  );
};
