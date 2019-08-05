/* jshint indent: 2 */

module.exports = function(sequelize, DataTypes) {
  return sequelize.define(
    'lexicon',
    {
      ID: {
        type: DataTypes.INTEGER(11),
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      CODE_MEANING: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      CODE_VALUE: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(2000),
        allowNull: true,
      },
      PARENT_ID: {
        type: DataTypes.INTEGER(11),
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
      SCHEMA_DESIGNATOR: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      SCHEMA_VERSION: {
        type: DataTypes.STRING(8),
        allowNull: true,
      },
      creator: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      synonyms: {
        type: DataTypes.STRING(1000),
        allowNull: true,
      },
    },
    {
      tableName: 'lexicon',
    }
  );
};
