/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'worklist_study',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      worklist_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
        references: {
          model: 'worklist',
          key: 'id',
        },
      },
      study_uid: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      study_desc: {
        type: DataTypes.STRING(1000),
        allowNull: true,
      },
      subject_uid: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      subject_name: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
      project_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
        references: {
          model: 'project',
          key: 'id',
        },
      },
      sortorder: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
      },
      numOfSeries: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
      },
      numOfImages: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
      startdate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      completedate: {
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
    },
    {
      tableName: 'worklist_study',
    }
  );
};
