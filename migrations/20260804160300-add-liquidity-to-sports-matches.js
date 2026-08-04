'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('sports_matches');

    if (!table.liquidity) {
      await queryInterface.addColumn('sports_matches', 'liquidity', {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('sports_matches');
    if (table.liquidity) {
      await queryInterface.removeColumn('sports_matches', 'liquidity');
    }
  },
};
