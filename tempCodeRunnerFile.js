const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== MySQL Connection =====
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "StockDB",
});

db.connect((err) => {
  if (err) throw err;
  console.log("✅ MySQL Connected...");
});

// ===== Serve Frontend =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===== Ensure main users table exists =====
db.query(
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    password VARCHAR(100)
  );`,
  (err) => {
    if (err) console.error("Error creating users table:", err);
    else console.log("✅ Users table ready.");
  }
);

// ===== Create user-specific portfolio table =====
function createUserTable(username) {
  const tableName = mysql.escapeId(username);
  const query = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE,
      action VARCHAR(50),
      stock VARCHAR(100),
      amount FLOAT,
      balance FLOAT DEFAULT 0
    );
  `;
  db.query(query, (err) => {
    if (err) console.error("Error creating table:", err);
    else console.log(`✅ Table created for user: ${username}`);
  });
}

// ===== Register =====
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.json({ success: false, message: "Please fill all fields." });

  db.query("SELECT * FROM users WHERE username = ?", [username], (err, rows) => {
    if (err) return res.json({ success: false, message: "DB error." });
    if (rows.length > 0)
      return res.json({ success: false, message: "User already exists." });

    db.query(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, password],
      (err) => {
        if (err) return res.json({ success: false, message: "Insert error." });

        createUserTable(username);
        res.json({ success: true, message: "User registered successfully!" });
      }
    );
  });
});

// ===== Login =====
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.json({ success: false, message: "Please fill all fields." });

  db.query("SELECT * FROM users WHERE username = ?", [username], (err, rows) => {
    if (err) return res.json({ success: false, message: "DB error." });
    if (rows.length === 0)
      return res.json({ success: false, message: "User not found." });

    const user = rows[0];
    if (user.password !== password)
      return res.json({ success: false, message: "Incorrect password." });

    const tableName = mysql.escapeId(username);
    db.query(`SELECT * FROM ${tableName}`, (err, results) => {
      if (err)
        return res.json({ success: false, message: "Error loading portfolio." });
      const balance = results.length ? results[results.length - 1].balance : 0;
      res.json({ success: true, username, portfolio: results, balance });
    });
  });
});

// ===== Add Trade =====
app.post("/api/trade", (req, res) => {
  const { date, stock, amount, action, user } = req.body;
  if (!user) return res.json({ success: false, message: "User missing." });

  const tableName = mysql.escapeId(user);

  // Get last balance
  const getBalance = `SELECT balance FROM ${tableName} ORDER BY id DESC LIMIT 1;`;
  db.query(getBalance, (err, results) => {
    if (err) return res.json({ success: false, message: "Error reading balance." });

    let currentBalance = results.length ? results[0].balance : 0;
    let newBalance = currentBalance;

    if (action === "buy") newBalance -= amount;
    else if (action === "sell") newBalance += amount;
    else if (action === "profit") newBalance += amount;
    else if (action === "loss") newBalance -= amount;

    const query = `INSERT INTO ${tableName} (date, stock, amount, action, balance)
                   VALUES (?, ?, ?, ?, ?)`;

    db.query(query, [date, stock, amount, action, newBalance], (err) => {
      if (err)
        return res.json({ success: false, message: "Error adding trade." });

      db.query(`SELECT * FROM ${tableName}`, (err, results) => {
        if (err)
          return res.json({ success: false, message: "Error fetching portfolio." });
        res.json({ success: true, portfolio: results, balance: newBalance });
      });
    });
  });
});

// ===== Get Portfolio =====
app.get("/api/portfolio/:user", (req, res) => {
  const user = req.params.user;
  const tableName = mysql.escapeId(user);

  db.query(`SELECT * FROM ${tableName}`, (err, results) => {
    if (err)
      return res.json({ success: false, message: "Error fetching portfolio." });
    const balance = results.length ? results[results.length - 1].balance : 0;
    res.json({ success: true, portfolio: results, balance });
  });
});

// ===== Start Server =====
app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));
