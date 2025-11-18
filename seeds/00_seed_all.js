/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */

const { faker } = require('@faker-js/faker');
const Chance = require('chance');
const chance = new Chance();
const bcrypt = require('bcryptjs');

exports.seed = async function(knex) {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  await knex('detak_jantung').truncate();
  await knex('spo2').truncate();
  await knex('notifikasi').truncate();
  await knex('lansia').truncate();
  await knex.raw('SET FOREIGN_KEY_CHECKS = 1');

  // LANSIA
  const hashedPass1 = await bcrypt.hash('123', 10);
  const hashedPass2 = await bcrypt.hash('321', 10);

  await knex('lansia').insert([
    {
      id: 1,
      name: 'Santoso Budi',
      phone_number: '123',
      password: hashedPass1,
      photo: 'avatar-profile.png',
      address: 'Jl. Merdeka No.1'
    },
    {
      id: 2,
      name: 'Aminah Amira',
      phone_number: '321',
      password: hashedPass2,
      photo: 'default-avatar-profile.jpg',
      address: 'Jl. Mawar No.2'
    }
  ]);


  //spo2 - cara ChanceJs
  function createSpo2() {
    return {
      lansia_id: chance.integer({ min: 1, max: 2 }),
      nilai: chance.integer({ min: 60, max: 100 })
    };
  }

  const spo2 = Array.from({ length: 20 }, () => createSpo2());
  await knex('spo2').insert(spo2);


  //detak jantung - cara FakerJs
  const bpmLansia = Array.from({ length: 20 }).map(() => ({
    lansia_id: faker.number.int({ min: 1, max: 2 }),
    nilai: faker.number.int({ min: 70, max: 120 })
  }));
  await knex('detak_jantung').insert(bpmLansia);


  //notif
  await knex('notifikasi').insert([
    {
      id: 1, //gk harus pake id
      lansia_id: 1,
      title: 'Info tanda vital',
      deskripsi: 'Kondisi Detak Jantung dan Oksigen tubuh anda sedang kurang baik'
    },
    {
      lansia_id: 1,
      title: 'Info tanda vital',
      deskripsi: 'Istirahat sejenak untuk memulihkan kondisi anda menjadi lebih baik'
    },
    {
      lansia_id: 2,
      title: 'Info tanda vital',
      deskripsi: 'Istirahat sejenak untuk memulihkan kondisi anda menjadi lebih baik'
    },
    {
      lansia_id: 2,
      title: 'Info tanda vital',
      deskripsi: 'Kondisi Detak Jantung dan Oksigen tubuh anda sedang kurang baik'
    }
  ]);
};
