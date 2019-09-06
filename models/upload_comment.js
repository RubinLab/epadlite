/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'upload_comment',
    {
      pk: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      login_name: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      comment: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      study_uid: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      created_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('current_timestamp'),
      },
    },
    {
      tableName: 'upload_comment',
    }
  );
};
