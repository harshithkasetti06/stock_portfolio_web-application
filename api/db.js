import mysql from "mysql2";

const db = mysql.createConnection({
  host: "localhost",
  user: "root",       // change if you use another MySQL user
  password: "",       // add password if you set one
  database: "userdb"  // create this database manually once
});

db.connect(err => {
  if (err) throw err;
  console.log("✅ Connected to MySQL");

  const createTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  db.query(createTable, err2 => {
    if (err2) throw err2;
    console.log("✅ Users table checked/created");
  });
});

export default db;
