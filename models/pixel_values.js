/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'pixel_values',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      file_path: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
      image_uid: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      frame_num: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'pixel_values',
    }
  );
};
