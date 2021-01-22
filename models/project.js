/* jshint indent: 2 */

module.exports = function (sequelize, DataTypes) {
  const project = sequelize.define(
    'project',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true,
      },
      projectid: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true,
      },
      type: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      description: {
        type: DataTypes.STRING(1000),
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
      defaulttemplate: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
    },
    {
      tableName: 'project',
    }
  );
  project.associate = (models) => {
    project.belongsToMany(models.user, {
      through: 'project_user',
      as: 'users',
      foreignKey: 'project_id',
    });
    // project.hasMany(models.user, { foreignKey: 'project_id' });
  };
  return project;
};
