/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  return sequelize.define(
    'epad_files',
    {
      pk: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      instance_fk: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      file_type: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      file_path: {
        type: DataTypes.STRING(1024),
        allowNull: true,
      },
      file_size: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      file_status: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      err_msg: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      file_md5: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      last_md5_check_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('current_timestamp'),
      },
      created_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: '0000-00-00 00:00:00',
      },
    },
    {
      tableName: 'epad_files',
    }
  );
};
