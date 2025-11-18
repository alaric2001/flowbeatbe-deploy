const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

// Konfigurasi koneksi ke MySQL dengan env
const dotenv = require('dotenv');
dotenv.config();

const bodyParser = require('body-parser');
const app = express();
app.use(cors());
app.use(bodyParser.json());

const bcrypt = require('bcryptjs'); //untuk autentikasi
const jwt = require('jsonwebtoken'); //untuk autentikasi

const multer = require('multer'); //untuk update akun
const fs = require('fs');

//port dengan env (tidak hardcode)
const HOST = process.env.HOST;
const PORT = process.env.PORT;
const IP_PUBLIC = process.env.IP_PUBLIC;


//KONEKSI DATABASE
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

// CEK KONEKSI DB
db.connect(err => {
    if (err) {
        console.error('Gagal konek ke MySQL:', err);
        return;
    }
    console.log('✅ Terhubung ke MySQL (XAMPP)');
});


const verifyToken = require('./middleware/auth'); //menggunakan middleware
const JWT_SECRET = process.env.JWT_SECRET;



// =====================
// Test ROUTES
// =====================
app.get('/', (req, res) => {
    res.send('Server Node.js + XAMPP aktif!');
});

// =====================
// REGISTRASI
// =====================
app.post('/api/register', async (req, res) => {
    const { name, phone_number, password, address } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const defaultPhoto = 'default-avatar-profile.jpg';

    const sql = `
        INSERT INTO lansia (name, phone_number, password, address, photo)
        VALUES (?, ?, ?, ?, ?)
    `;
    db.query(sql, [name, phone_number, hashed, address, defaultPhoto], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Akun berhasil dibuat', id: result.insertId });
    });
});

// =====================
// LOGIN
// =====================
app.post('/api/login', (req, res) => {
    // console.log('Body login diterima:', req.body);

    // Terima keduanya: phone atau phone_number
    const phone_number = req.body.phone_number || req.body.phone;
    const { password } = req.body;

    if (!phone_number || !password) {
        return res.status(400).json({ message: 'Nomor handphone dan password wajib diisi.' });
    }

    db.query('SELECT * FROM lansia WHERE phone_number = ?', [phone_number], async (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(401).json({ message: 'User tidak ditemukan' });

        const user = results[0];
        try {
            const match = await bcrypt.compare(password, user.password);
            if (!match) return res.status(401).json({ message: 'Password salah' });

            const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '2h' });
            return res.json({
                message: 'Login berhasil',
                token,
                lansia: {
                    id: user.id,
                    name: user.name,
                    phone_number: user.phone_number,
                    address: user.address
                }
            });
        } catch (e) {
            console.error('Error bcrypt.compare:', e);
            return res.status(500).json({ message: 'Terjadi kesalahan saat verifikasi password' });
        }
    });
});

// =====================
// GET data-data home
// =====================
app.get('/api/home', verifyToken, (req, res) => {
    const userId = req.user.id;
    const sql = `
        SELECT 
            l.name, 
            l.photo,
            (SELECT nilai FROM detak_jantung WHERE lansia_id = l.id ORDER BY created_at DESC LIMIT 1) AS bpm,
            (SELECT nilai FROM spo2 WHERE lansia_id = l.id ORDER BY created_at DESC LIMIT 1) AS spo2
        FROM lansia l WHERE l.id = ?`;
    db.query(sql, [userId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.length === 0) return res.status(404).json({ message: 'User not found' });

        const user = result[0];

        // ✅ Tambahkan path relatif (jika ada foto)
        if (user.photo) {
        user.photo = `images/${user.photo}`;
        }

            // Deteksi kondisi tidak normal dan catat notifikasi
        const lansiaId = userId;

        // Cek nilai detak jantung dan SpO2
        if (user.bpm && (user.bpm < 60 || user.bpm > 100)) {
            const title = 'Detak Jantung Tidak Normal';
            const deskripsi = 'Detak jantung tidak normal. Duduk dengan posisi yang nyaman dan pejamkan mata. Tarik napas dalam-dalam selama 3 detik lalu buang napas.';
            
            db.query(
                'INSERT INTO notifikasi (lansia_id, title, deskripsi) VALUES (?, ?, ?)',
                [lansiaId, title, deskripsi],
                (err) => {
                    if (err) console.error('Gagal insert notifikasi BPM:', err.message);
                }
            );
        }

        if (user.spo2 && user.spo2 < 90) {
            const title = 'Oksigen Tubuh Tidak Normal';
            let deskripsi = 'Nilai SpO₂ di bawah 90%. Duduk tegak, tarik napas dalam perlahan, dan pindah ke tempat dengan ventilasi baik.';
            if (user.spo2 < 88) {
                deskripsi = 'Nilai SpO₂ di bawah 88%. Segera hubungi IGD.';
            }

            db.query(
                'INSERT INTO notifikasi (lansia_id, title, deskripsi) VALUES (?, ?, ?)',
                [lansiaId, title, deskripsi],
                (err) => {
                    if (err) console.error('Gagal insert notifikasi SpO2:', err.message);
                }
            );
        }

        res.json(user);
    });
});

app.use('/images', express.static(path.join(__dirname, 'images')));

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));


// =====================
// GET Akun
// =====================
app.get('/api/akun', verifyToken, (req, res) => {
    const userId = req.user.id;
    const sql=`SELECT name, phone_number, address, photo FROM lansia WHERE id = ?`;
    db.query(sql, [userId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.length === 0) return res.status(404).json({ message: 'User not found' });

        const user = result[0];

        // ✅ Tambahkan path relatif (jika ada foto)
        if (user.photo) {
        user.photo = `images/${user.photo}`;
        }

        res.json(user);
    });
});

// =====================
// KONFIGURASI UPLOAD FOTO
// =====================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = path.join(__dirname, 'images');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
        cb(null, uniqueName);
    },
});

const upload = multer({ storage });

// =====================
// Update Profil
// =====================
app.put('/api/edit-profile', verifyToken, upload.single('photo'), async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, phone_number, password, address } = req.body;
        const photo = req.file ? req.file.filename : null;

    // Ambil data lama user (terutama foto lama)
    db.query('SELECT photo FROM lansia WHERE id = ?', [userId], async (err, results) => {
        if (err) {
            console.error('Error fetching old photo:', err);
            return res.status(500).json({ message: 'Gagal mengambil data lama' });
        }

        const oldPhoto = results[0]?.photo;
        let sql = 'UPDATE lansia SET name = ?, phone_number = ?, address = ?';
        const params = [name, phone_number, address];

        if (photo) {
            sql += ', photo = ?';
            params.push(photo);
        }

        if (password && password.trim() !== '') {
            const hashed = await bcrypt.hash(password, 10);
            sql += ', password = ?';
            params.push(hashed);
        }

        sql += ' WHERE id = ?';
        params.push(userId);

        db.query(sql, params, (err2, result) => {
            if (err2) {
            console.error('Error updating profile:', err2);
            return res.status(500).json({ message: 'Gagal memperbarui profil' });
            }

            // Jika ada foto baru dan foto lama bukan null/default, hapus foto lama dari folder
            if (photo && oldPhoto &&
            oldPhoto !== 'default-avatar-profile.jpg' &&
            oldPhoto !== 'avatar-profile'
            ) {
                const oldPath = path.join(__dirname, 'images', oldPhoto);
                fs.unlink(oldPath, (unlinkErr) => {
                    if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                    console.warn('Gagal menghapus foto lama:', unlinkErr.message);
                    }
                });
            }

            res.json({ message: 'Profil berhasil diperbarui' });
        });
    });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Gagal memperbarui profil' });
    }
});

// =====================
// API DETAIL DATA KESEHATAN
// =====================
app.get('/api/kesehatan', (req, res) => {
    const userId = req.query.userId || 1;

    const sql = `
        SELECT 
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS waktu,
        'detak_jantung' AS jenis,
        nilai,
        lansia_id
        FROM detak_jantung
        WHERE lansia_id = ?

        UNION

        SELECT 
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS waktu,
        'spo2' AS jenis,
        nilai,
        lansia_id
        FROM spo2
        WHERE lansia_id = ?

        ORDER BY waktu DESC
    `;

    db.query(sql, [userId, userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        // Gabungkan berdasarkan waktu
        const merged = {};
        results.forEach(row => {
        if (!merged[row.waktu]) {
            merged[row.waktu] = { waktu: row.waktu, detak_jantung: '-', spo2: '-' };
        }
        if (row.jenis === 'detak_jantung') {
            merged[row.waktu].detak_jantung = row.nilai;
        } else if (row.jenis === 'spo2') {
            merged[row.waktu].spo2 = row.nilai;
        }
        });

        // Konversi nama hari ke Bahasa Indonesia
        const hariIndonesia = {
        Sunday: 'Minggu',
        Monday: 'Senin',
        Tuesday: 'Selasa',
        Wednesday: 'Rabu',
        Thursday: 'Kamis',
        Friday: 'Jumat',
        Saturday: 'Sabtu'
        };

        const final = Object.values(merged).map(item => {
        const date = new Date(item.waktu);
        const hari = hariIndonesia[date.toLocaleDateString('en-US', { weekday: 'long' })];
        const tanggal = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}\n${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        return {
            tanggal,
            detak_jantung: item.detak_jantung,
            spo2: item.spo2
        };
        });

        res.json(final);
    });
});

// =====================
// API RIWAYAT DETAK JANTUNG
// =====================
app.get('/api/detak-jantung', verifyToken, (req, res) => {
    const userId = req.user.id;
    const periode = req.query.periode || 'Minggu'; // Hari, Minggu, Bulan, Tahun
    
    let dateFilter = '';
    const now = new Date();
    
    switch (periode) {
        case 'Hari':
            // Last 24 hours
            dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)';
            break;
        case 'Minggu':
            // Last 7 days
            dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
            break;
        case 'Bulan':
            // Last 30 days
            dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
            break;
        case 'Tahun':
            // Last 12 months
            dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)';
            break;
    }
    
    const sql = `
        SELECT id, lansia_id, nilai, created_at 
        FROM detak_jantung 
        WHERE lansia_id = ? ${dateFilter}
        ORDER BY created_at DESC
    `;
    
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// ---------------------
// CRUD: LANSIA
// ---------------------

// GET semua lansia
app.get('/lansia', verifyToken, (req, res) => { //tambahan verifyToken
    db.query('SELECT * FROM lansia', (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// READ - Lansia by ID
app.get('/lansia/:id', verifyToken, (req, res) => {
    const sql = 'SELECT * FROM lansia WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        if (result.length === 0) return res.status(404).json({ message: 'Data tidak ditemukan' });
        res.json(result[0]);
    });
});

// POST tambah lansia
//sudah digantikan dengan /regist

// PUT update lansia
app.put('/lansia/:id', (req, res) => {
    const { id } = req.params;
    const { name, phone_number, password, address } = req.body;
    db.query(
        'UPDATE lansia SET name=?, phone_number=?, password=?, address=? WHERE id=?',
        [name, phone_number, password, address, id],
        (err) => {
            if (err) return res.status(500).json({ error: err });
            res.json({ message: 'Lansia diperbarui' });
        }
    );
});
// DELETE lansia
// DELETE - Lansia (dengan peringatan & pengecekan relasi)
app.delete('/lansia/:id', (req, res) => {
    const lansiaId = req.params.id;

    // Cek apakah ada data terkait di tabel lain
    const checkRelations = `
        SELECT 
        (SELECT COUNT(*) FROM detak_jantung WHERE lansia_id = ?) AS detak_count,
        (SELECT COUNT(*) FROM spo2 WHERE lansia_id = ?) AS spo2_count,
        (SELECT COUNT(*) FROM notifikasi WHERE lansia_id = ?) AS notif_count
    `;

    db.query(checkRelations, [lansiaId, lansiaId, lansiaId], (err, results) => {
        if (err) return res.status(500).json({ error: err });

        const { detak_count, spo2_count, notif_count } = results[0];
        const totalRelations = detak_count + spo2_count + notif_count;

        if (totalRelations > 0) {
        return res.status(400).json({
            message: 'Tidak dapat menghapus data lansia ini karena masih memiliki data terkait di tabel lain.',
            detail: { detak_count, spo2_count, notif_count }
        });
        }

        // Jika aman untuk dihapus
        const sql = 'DELETE FROM lansia WHERE id = ?';
        db.query(sql, [lansiaId], (err, result) => {
        if (err) return res.status(500).json({ error: err });
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Data tidak ditemukan' });
        res.json({ message: 'Data lansia berhasil dihapus' });
        });
    });
});

// ---------------------
// CRUD: SPO2
// ---------------------

app.get('/spo2', (req, res) => {
    db.query('SELECT * FROM spo2', (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

app.get('/spo-2', (req, res) => {
    const sql = `
        SELECT s.*, l.name AS nama_lansia 
        FROM spo2 s
        JOIN lansia l ON s.lansia_id = l.id
        ORDER BY s.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

app.post('/spo2', (req, res) => {
    const { lansia_id, nilai } = req.body;
    db.query(
        'INSERT INTO spo2 (lansia_id, nilai) VALUES (?, ?)',
        [lansia_id, nilai],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.json({ message: 'Data SpO2 ditambahkan', id: result.insertId });
        }
    );
});

// ---------------------
// CRUD: Detak Jantung
// ---------------------

app.get('/detak-jantung', (req, res) => {
    db.query('SELECT * FROM detak_jantung', (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

// GET semua detak_jantung
app.get('/detak_jantung', (req, res) => {
    const sql = `
        SELECT dj.*, l.name AS nama_lansia 
        FROM detak_jantung dj
        JOIN lansia l ON dj.lansia_id = l.id
        ORDER BY dj.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

app.post('/detak-jantung', (req, res) => {
    const { lansia_id, nilai } = req.body;
    db.query(
        'INSERT INTO detak_jantung (lansia_id, nilai) VALUES (?, ?)',
        [lansia_id, nilai],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.json({ message: 'Data detak jantung ditambahkan', id: result.insertId });
        }
    );
});

// ---------------------
// CRUD: Notifikasi
// ---------------------


app.get('/notifikasi', verifyToken, (req, res) => {
    const userId = req.user.id;
    const sql = 'SELECT * FROM notifikasi WHERE lansia_id = ? ORDER BY created_at DESC';
    
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

app.get('/notif', (req, res) => {
    const sql = `
        SELECT n.*, l.name AS nama_lansia 
        FROM notifikasi n
        JOIN lansia l ON n.lansia_id = l.id
        ORDER BY n.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err });
        res.json(results);
    });
});

app.post('/notifikasi', (req, res) => {
    const { lansia_id, title, deskripsi } = req.body;
    db.query(
        'INSERT INTO notifikasi (lansia_id, title, deskripsi) VALUES (?, ?, ?)',
        [lansia_id, title, deskripsi],
        (err, result) => {
            if (err) return res.status(500).json({ error: err });
            res.json({ message: 'Notifikasi ditambahkan', id: result.insertId });
        }
    );
});

app.delete('/notifikasi/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM notifikasi WHERE id=?', [id], (err) => {
        if (err) return res.status(500).json({ error: err });
        res.json({ message: 'Notifikasi dihapus' });
    });
});


app.listen(PORT, HOST, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
    console.log(`Akses jaringan: http://${IP_PUBLIC}:${PORT}`);
});
