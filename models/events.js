/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('events', {
    pk: {
      type: DataTypes.INTEGER(11),
      allowNull: false,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    event_status: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    aim_uid: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    aim_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    patient_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    patient_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    template_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    template_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    plugin_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    created_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.fn('current_timestamp')
    },
    series_uid: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    study_uid: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    project_id: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    project_name: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    error: {
      type: DataTypes.STRING(5),
      allowNull: true
    }
  }, {
    tableName: 'events'
  });
};
