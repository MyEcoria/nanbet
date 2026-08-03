'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('sports_matches');

    if (!table.sport) {
      await queryInterface.addColumn('sports_matches', 'sport', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'football',
      });
    }

    await queryInterface.changeColumn('sports_matches', 'drawTokenId', {
      type: Sequelize.STRING(128),
      allowNull: true,
    });

    await queryInterface.changeColumn('sports_matches', 'drawOdds', {
      type: Sequelize.DECIMAL(10, 4),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('sports_matches', 'drawOdds', {
      type: Sequelize.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 3,
    });

    await queryInterface.changeColumn('sports_matches', 'drawTokenId', {
      type: Sequelize.STRING(128),
      allowNull: false,
    });

    const table = await queryInterface.describeTable('sports_matches');
    if (table.sport) {
      await queryInterface.removeColumn('sports_matches', 'sport');
    }
  },
};
