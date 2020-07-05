/* jshint indent: 2 */
// type : values(local, store (remote plugin central store))
// processmultipleaims : values(null , 0 ,1 ) null -> no annotation , 0 -> expects 1 annotations , 1 -> expects multiple annotations
//  if processmultipleaims === 0 then if multiple annotation selected each annotataion will run plugin as seperate process
// if processmultipleaims === 1 then multiple annotation will be sent to the plugin and there will be only one plugin process
module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'plugin_docker',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      plugin_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      image_repo: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      image_tag: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      image_name: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      image_id: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      basecommand: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      memory: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
      },
      maxruntime: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
      },
      type: {
        type: DataTypes.STRING(5),
        allowNull: true,
      },
      description: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      javaclass: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
      enabled: {
        type: DataTypes.INTEGER(1),
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      modality: {
        type: DataTypes.STRING(64),
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
      developer: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      documentation: {
        type: DataTypes.STRING(2000),
        allowNull: true,
      },
      rateTotal: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      rateCount: {
        type: DataTypes.INTEGER(11),
        allowNull: true,
      },
      processmultipleaims: {
        type: DataTypes.INTEGER(1),
        allowNull: true,
        defaultValue: '0',
      },
    },
    {
      tableName: 'plugin_docker',
    }
  );
};
