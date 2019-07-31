/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('project_subject_study', {
    id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    proj_subj_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true,
      references: {
        model: 'project_subject',
        key: 'id'
      }
    },
    study_id: {
      type: DataTypes.INTEGER(10).UNSIGNED,
      allowNull: true,
      references: {
        model: 'study',
        key: 'id'
      }
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
    tableName: 'project_subject_study'
  });
};
