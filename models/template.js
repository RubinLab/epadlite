/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'template',
    {
      id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      templateLevelType: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      templateUID: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      templateName: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      authors: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      version: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      templateCreationDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      templateDescription: {
        type: DataTypes.STRING(256),
        allowNull: true,
      },
      codingSchemeVersion: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      templateType: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      templateCode: {
        type: DataTypes.STRING(128),
        allowNull: true,
        unique: true,
      },
      codingSchemeDesignator: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      modality: {
        type: DataTypes.STRING(12),
        allowNull: true,
      },
      file_id: {
        type: DataTypes.INTEGER(10).UNSIGNED,
        allowNull: true,
        references: {
          model: 'epad_file',
          key: 'id',
        },
      },
      creator: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      createdtime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: '0000-00-00 00:00:00',
      },
      updatetime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: '0000-00-00 00:00:00',
      },
    },
    {
      tableName: 'template',
    }
  );
};
