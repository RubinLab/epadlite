/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'upload_processing',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      params: {
        type: DataTypes.STRING(256),
        allowNull: false,
      },
      query: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      path: {
        type: DataTypes.STRING(256),
        allowNull: false,
      },
      files_only: {
        type: DataTypes.INTEGER(1),
        allowNull: true,
      },
      zip_source: {
        type: DataTypes.STRING(256),
        allowNull: false,
      },
      attempt_number: {
        type: DataTypes.INTEGER(10),
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
      tableName: 'upload_processing',
    }
  );
};
