/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'nondicom_series',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      seriesuid: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true,
      },
      study_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
        references: {
          model: 'study',
          key: 'id',
        },
      },
      description: {
        type: DataTypes.STRING(1000),
        allowNull: true,
      },
      seriesdate: {
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
      modality: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      referencedseries: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
    },
    {
      tableName: 'nondicom_series',
    }
  );
};
