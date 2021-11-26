/* jshint indent: 2 */
//  status values: 0 -> not done yet, 1 -> already ran
module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'plugin_subqueue',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      qid: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        references: {
          model: 'plugin_queue',
          key: 'id',
        },
      },
      parent_qid: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        references: {
          model: 'plugin_queue',
          key: 'id',
        },
      },
      status: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      creator: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
    },
    {
      tableName: 'plugin_subqueue',
    }
  );
};
