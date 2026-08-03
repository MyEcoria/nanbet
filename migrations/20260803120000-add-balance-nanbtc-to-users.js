'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('users');
    if (table.balanceNANBTC) {
      return;
    }

    await queryInterface.addColumn('users', 'balanceNANBTC', {
      type: Sequelize.DECIMAL(30, 10),
      allowNull: false,
      defaultValue: 0,
      comment: 'nanBTC balance',
    });
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('users');
    if (!table.balanceNANBTC) {
      return;
    }

    await queryInterface.removeColumn('users', 'balanceNANBTC');
  },
};
