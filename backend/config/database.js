const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// 数据库文件路径
const DB_PATH = path.join(__dirname, '..', 'database', 'dog_board.db');

// 创建数据库连接
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('连接数据库失败:', err.message);
  } else {
    console.log('✅ 已连接到SQLite数据库');
  }
});

// 初始化数据库表
const initialize = () => {
  return new Promise((resolve, reject) => {
    // 启用外键约束
    db.run('PRAGMA foreign_keys = ON');

    // 创建用户表
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number VARCHAR(20) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK(role IN ('super_admin', 'manager', 'staff_edit', 'staff_view')),
        permissions TEXT, -- JSON格式存储具体权限
        store_id INTEGER,
        is_active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
    });

    // 创建门店表
    db.run(`
      CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(200) NOT NULL,
        address TEXT,
        phone VARCHAR(20),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
    });

    // 创建狗狗档案表
    db.run(`
      CREATE TABLE IF NOT EXISTS dogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL,
        breed VARCHAR(100),
        age VARCHAR(50),
        gender VARCHAR(10) CHECK(gender IN ('male', 'female', 'unknown')),
        weight DECIMAL(5,2),
        vaccinated BOOLEAN DEFAULT 0,
        neutered BOOLEAN DEFAULT 0,
        dewormed BOOLEAN DEFAULT 0,
        bites_people BOOLEAN DEFAULT 0,
        bites_dogs BOOLEAN DEFAULT 0,
        illnesses TEXT,
        special_notes TEXT,
        owner VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'available' CHECK(status IN ('available', 'in_store', 'reserved')),
        created_by INTEGER,
        store_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      )
    `, (err) => {
      if (err) reject(err);
    });

    // 创建房间表
    db.run(`
      CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        number VARCHAR(20) UNIQUE NOT NULL,
        type VARCHAR(50) CHECK(type IN ('standard', 'deluxe', 'vip')),
        size VARCHAR(50),
        price_per_day DECIMAL(10,2) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'maintenance')),
        store_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (store_id) REFERENCES stores(id)
      )
    `, (err) => {
      if (err) reject(err);
    });

    // 创建预约表
    db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dog_id INTEGER NOT NULL,
        room_id INTEGER NOT NULL,
        check_in_time TIMESTAMP NOT NULL,
        check_out_time TIMESTAMP NOT NULL,
        actual_check_in TIMESTAMP,
        actual_check_out TIMESTAMP,
        total_amount DECIMAL(10,2),
        paid_amount DECIMAL(10,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled', 'no_show')),
        checked_in BOOLEAN DEFAULT 0,
        special_requirements TEXT,
        notes TEXT,
        created_by INTEGER,
        store_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dog_id) REFERENCES dogs(id),
        FOREIGN KEY (room_id) REFERENCES rooms(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (store_id) REFERENCES stores(id)
      )
    `, (err) => {
      if (err) reject(err);
    });

    // 创建操作日志表
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action VARCHAR(100) NOT NULL,
        table_name VARCHAR(50),
        record_id INTEGER,
        old_data TEXT,
        new_data TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, (err) => {
      if (err) reject(err);
    });

    // 创建索引
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_dogs_owner ON dogs(owner)',
      'CREATE INDEX IF NOT EXISTS idx_dogs_phone ON dogs(phone)',
      'CREATE INDEX IF NOT EXISTS idx_dogs_status ON dogs(status)',
      'CREATE INDEX IF NOT EXISTS idx_bookings_dog_id ON bookings(dog_id)',
      'CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id)',
      'CREATE INDEX IF NOT EXISTS idx_bookings_check_in ON bookings(check_in_time)',
      'CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)'
    ];

    let completed = 0;
    indexes.forEach(sql => {
      db.run(sql, (err) => {
        if (err) reject(err);
        completed++;
        if (completed === indexes.length) {
          // 所有表创建完成
          seedInitialData().then(resolve).catch(reject);
        }
      });
    });
  });
};

// 初始化数据
const seedInitialData = async () => {
  return new Promise((resolve, reject) => {
    // 检查是否已有超级管理员
    db.get('SELECT COUNT(*) as count FROM users WHERE role = "super_admin"', async (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      if (row.count === 0) {
        // 创建默认门店
        db.run(
          `INSERT INTO stores (name, address, phone, description) VALUES (?, ?, ?, ?)`,
          ['嘤嘤大师狗狗俱乐部', '默认地址', '13800138000', '默认门店'],
          async function(err) {
            if (err) {
              reject(err);
              return;
            }

            const storeId = this.lastID;

            // 创建超级管理员（店长）
            const hashedPassword = await bcrypt.hash('admin123', 10);
            db.run(
              `INSERT INTO users (phone_number, password_hash, name, role, store_id, permissions) VALUES (?, ?, ?, ?, ?, ?)`,
              ['13800138000', hashedPassword, '超级店长', 'super_admin', storeId, JSON.stringify({
                can_export: true,
                can_delete: true,
                can_edit: true,
                can_create: true,
                can_view: true,
                can_manage_users: true,
                can_view_audit: true
              })],
              (err) => {
                if (err) reject(err);
                else {
                  console.log('✅ 已创建默认超级管理员: 13800138000 / admin123');
                  resolve();
                }
              }
            );
          }
        );
      } else {
        resolve();
      }
    });
  });
};

// 数据库查询包装函数
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

// 关闭数据库连接
const close = () => {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else {
        console.log('🔒 数据库连接已关闭');
        resolve();
      }
    });
  });
};

module.exports = {
  db,
  initialize,
  query,
  get,
  run,
  close
};