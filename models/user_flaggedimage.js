/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('user_flaggedimage', {
    id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    image_uid: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    project_id: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    subject_id: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    study_id: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    creator: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    createdtime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.fn('current_timestamp')
    },
    updatetime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: '0000-00-00 00:00:00'
    },
    updated_by: {
      type: DataTypes.STRING(64),
      allowNull: true
    }
  }, {
    tableName: 'user_flaggedimage'
  });
};
