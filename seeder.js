const mysql = require('mysql2');

const db = mysql.createConnection({
    host: '127.0.0.1',
    port: 7000,
    user: 'root',
    password: '',
    database: 'flowbeat'
});

db.connect(err => {
    if (err) throw err;
    console.log('✅ Connected to MySQL');
    seedData();
});

function seedData() {
  // Lansia
    db.query(
        `INSERT INTO lansia (name, phone_number, password, address) VALUES 
        ('Budi Santoso', '081234567890', 'hashedpass1', 'Jl. Merdeka 1'),
        ('Siti Aminah', '082345678901', 'hashedpass2', 'Jl. Mawar 2')`
    );

    // SpO2
    db.query(
        `INSERT INTO spo2 (lansia_id, nilai) VALUES 
        (1, 97.5),
        (2, 95.2)`
    );

    // Detak Jantung
    db.query(
        `INSERT INTO detak_jantung (lansia_id, nilai) VALUES 
        (1, 88),
        (2, 102)`
    );

    // Notifikasi
    db.query(
        `INSERT INTO notifikasi (lansia_id, title, deskripsi) VALUES 
        (1, 'Peringatan Detak Jantung', 'Detak jantung melebihi batas normal'),
        (2, 'Koneksi Perangkat', 'Perangkat Omron berhasil terhubung')`
    );

    console.log('✅ Dummy data berhasil dimasukkan');
    db.end();
}