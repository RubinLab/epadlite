/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('subject', {
    id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    subjectuid: {
      type: DataTypes.STRING(128),
      allowNull: true,
      unique: true
    },
    name: {
      type: DataTypes.STRING(256),
      allowNull: true
    },
    gender: {
      type: DataTypes.STRING(16),
      allowNull: true
    },
    dob: {
      type: DataTypes.DATEONLY,
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
    },
    displayuid: {
      type: DataTypes.STRING(128),
      allowNull: true
    }
  }, {
    tableName: 'subject'
  });
};
